import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { MIGRACOES } from './schema'
import { semearRecintos } from './semente'
import * as COPIAS from './copias'
import { PASTA_COPIAS } from './copias'

export { MAX_COPIAS, PASTA_COPIAS } from './copias'
import { PESOS_POR_OMISSAO } from '../engine/pesos'

let db: Database.Database | null = null

/**
 * A base de dados vive numa pasta `data/` ao lado do executável, para que toda a
 * aplicação seja copiável como uma pasta única (pen, OneDrive, outro PC).
 */
export function caminhoBaseDados(raizPortatil: string): string {
  return join(raizPortatil, 'data', 'delegados.db')
}

export interface OpcoesBaseDados {
  /** Onde ficam as cópias de segurança. As verificações usam pastas próprias. */
  pastaCopias?: string
  /** Semear os recintos já confirmados. Desligado nas verificações, que montam os seus. */
  semearRecintos?: boolean
}

export function abrirBaseDados(caminho: string, opcoes: OpcoesBaseDados = {}): Database.Database {
  const { pastaCopias = PASTA_COPIAS, semearRecintos: comRecintos = true } = opcoes
  mkdirSync(dirname(caminho), { recursive: true })
  const existia = existsSync(caminho)

  const conn = new Database(caminho)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  // Com WAL, `NORMAL` é seguro contra falhas da aplicação (só uma falha de
  // energia pode perder a última transação) e evita um fsync por escrita —
  // é a diferença entre uma importação fluida e a interface a engasgar.
  conn.pragma('synchronous = NORMAL')
  // Antes das migrações: se alguma correr mal, a cópia é de um estado bom.
  if (existia) copiaSeguranca(conn, pastaCopias)
  aplicarMigracoes(conn)
  semearConfiguracao(conn)
  // Recintos já confirmados: entram numa base de dados nova, e numa que já
  // exista só preenchem o que estiver em falta.
  if (comRecintos) {
    const semente = semearRecintos(conn)
    if (semente.criados || semente.preenchidos) {
      console.log(`Recintos conhecidos: ${semente.criados} criados, ${semente.preenchidos} preenchidos`)
    }
  }
  db = conn
  return conn
}

/**
 * Guarda uma cópia da base de dados a cada arranque e mantém as `MAX_COPIAS` mais
 * recentes. Usa `VACUUM INTO`, que produz um ficheiro coerente com o WAL
 * já incorporado — copiar o ficheiro à mão podia deixar de fora as últimas
 * transações, que vivem no `-wal`.
 */
export function copiaSeguranca(conn: Database.Database, pasta = PASTA_COPIAS): string | null {
  try {
    mkdirSync(pasta, { recursive: true })
    const destino = join(pasta, COPIAS.nomeDaCopia())
    if (!existsSync(destino)) conn.prepare('VACUUM INTO ?').run(destino)
    for (const nome of COPIAS.copiasAApagar(readdirSync(pasta))) {
      try {
        rmSync(join(pasta, nome), { force: true })
      } catch {
        /* se o ficheiro estiver bloqueado, fica para a próxima */
      }
    }
    return destino
  } catch (erro) {
    // Uma cópia falhada nunca pode impedir a aplicação de abrir.
    console.warn('Não foi possível criar cópia de segurança da base de dados:', erro)
    return null
  }
}

export interface CopiaSegurancaInfo {
  ficheiro: string
  caminho: string
  bytes: number
  criadaEm: string
}

export function listarCopiasSeguranca(pasta = PASTA_COPIAS): CopiaSegurancaInfo[] {
  if (!existsSync(pasta)) return []
  return COPIAS.copiasPorData(readdirSync(pasta)).map((ficheiro) => {
    const caminho = join(pasta, ficheiro)
    const info = statSync(caminho)
    return { ficheiro, caminho, bytes: info.size, criadaEm: info.mtime.toISOString() }
  })
}

/** Erro com uma explicação que se pode mostrar ao utilizador tal como está. */
export class ErroBaseDados extends Error {}

export function versaoDoEsquema(conn: Database.Database): number {
  const linha = conn.prepare('SELECT MAX(versao) AS v FROM schema_versao').get() as { v: number | null }
  return linha?.v ?? 0
}

/** A versão que esta compilação da aplicação sabe produzir. */
export function versaoConhecida(): number {
  return MIGRACOES.reduce((maior, m) => Math.max(maior, m.versao), 0)
}

/**
 * Leva o esquema até à versão desta compilação. É isto que permite entregar um
 * executável novo por cima de uma base de dados antiga: as migrações em falta
 * correm sozinhas no arranque, uma a uma, cada uma na sua transação. Repetir o
 * arranque não repete nada — o que já foi aplicado fica registado.
 */
function aplicarMigracoes(conn: Database.Database): void {
  conn.exec('CREATE TABLE IF NOT EXISTS schema_versao (versao INTEGER PRIMARY KEY, aplicada_em TEXT NOT NULL)')
  const aplicadas = new Set(
    conn.prepare('SELECT versao FROM schema_versao').all().map((l) => (l as { versao: number }).versao)
  )

  // Base de dados de uma versão mais recente do que o executável: parar já. Se
  // continuássemos, escrevíamos com o esquema antigo por cima de dados novos.
  const jaAplicada = versaoDoEsquema(conn)
  if (jaAplicada > versaoConhecida()) {
    throw new ErroBaseDados(
      `Esta base de dados foi criada por uma versão mais recente da aplicação ` +
        `(esquema ${jaAplicada}; este executável conhece até ${versaoConhecida()}). ` +
        `Instale a versão mais recente — abrir assim corromperia os dados.`
    )
  }

  for (const migracao of MIGRACOES) {
    if (aplicadas.has(migracao.versao)) continue
    const correr = conn.transaction(() => {
      conn.exec(migracao.sql)
      conn
        .prepare('INSERT INTO schema_versao (versao, aplicada_em) VALUES (?, ?)')
        .run(migracao.versao, new Date().toISOString())
    })
    try {
      correr()
    } catch (erro) {
      // A transação já reverteu esta migração; o resto da base de dados está
      // como estava. Vale mais parar do que continuar com o esquema a meio.
      throw new ErroBaseDados(
        `A atualização da base de dados falhou na migração ${migracao.versao} ` +
          `(${migracao.descricao}): ${(erro as Error).message}`
      )
    }
    console.log(`Migração ${migracao.versao} aplicada: ${migracao.descricao}`)
  }
}

export const CONFIG_POR_OMISSAO: Record<string, string> = {
  'motor.pesos': JSON.stringify(PESOS_POR_OMISSAO),
  'motor.distanciaMaximaKm': '0',
  'motor.margemEntreJogosMinutos': '180',
  'geo.nominatimUrl': 'https://nominatim.openstreetmap.org',
  'geo.osrmUrl': 'https://router.project-osrm.org',
  'geo.fatorHaversine': '1.25',
  'geo.contacto': 'nomeacoes-delegados-fpf',
  'fpf.baseUrl': 'https://resultados.fpf.pt',
  'fpf.seasonId': '106',
  'sync.automatico': 'true',
  'mapa.tilesUrl': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
}

function semearConfiguracao(conn: Database.Database): void {
  const inserir = conn.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)')
  const correr = conn.transaction(() => {
    for (const [chave, valor] of Object.entries(CONFIG_POR_OMISSAO)) inserir.run(chave, valor)
  })
  correr()
}

/**
 * Fecha a ligação. Só é preciso para repor uma cópia de segurança: no Windows o
 * ficheiro não pode ser substituído enquanto estiver aberto.
 */
export function fecharBaseDados(): void {
  db?.close()
  db = null
}

/**
 * Substitui a base de dados atual por uma cópia de segurança.
 *
 * Antes de trocar seja o que for, guarda o estado atual como mais uma cópia —
 * repor é uma decisão que também se pode querer desfazer. Os ficheiros `-wal` e
 * `-shm` da base antiga são removidos: se ficassem, o SQLite juntaria a eles a
 * base restaurada e o resultado seria uma mistura das duas.
 */
export function reporCopiaSeguranca(origem: string, caminho: string, pastaCopias = PASTA_COPIAS): void {
  // Só se aceita um ficheiro que esteja mesmo na pasta das cópias e com o nome
  // que a aplicação lhes dá: isto substitui a base de dados do coordenador, não
  // é sítio para aceitar um caminho qualquer.
  const dentroDaPasta = resolve(origem).startsWith(resolve(pastaCopias) + sep)
  if (!dentroDaPasta || !COPIAS.PADRAO_COPIA.test(basename(origem))) {
    throw new Error('Só é possível repor cópias de segurança criadas pela aplicação.')
  }
  if (!existsSync(origem)) throw new Error('Essa cópia de segurança já não existe.')

  if (existsSync(caminho)) copiaSeguranca(obterBaseDados(), pastaCopias)
  fecharBaseDados()
  copyFileSync(origem, caminho)
  for (const extra of ['-wal', '-shm']) {
    try {
      rmSync(`${caminho}${extra}`, { force: true })
    } catch {
      /* pode não existir */
    }
  }
  abrirBaseDados(caminho, { pastaCopias })
}

export function obterBaseDados(): Database.Database {
  if (!db) throw new Error('Base de dados não inicializada')
  return db
}

export function lerConfig(chave: string): string | null {
  const linha = obterBaseDados().prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as
    | { valor: string }
    | undefined
  return linha?.valor ?? null
}

export function escreverConfig(chave: string, valor: string): void {
  obterBaseDados()
    .prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
    .run(chave, valor)
}

/**
 * Corre várias escritas como uma só transação. Importações e sincronizações
 * fazem centenas de escritas; uma a uma, bloqueiam o processo principal.
 */
export function emTransacao<T>(tarefa: () => T): T {
  return obterBaseDados().transaction(tarefa)()
}

export function registarAuditoria(entidade: string, entidadeId: number | null, accao: string, payload?: unknown): void {
  obterBaseDados()
    .prepare('INSERT INTO audit_log (entidade, entidade_id, accao, payload, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run(entidade, entidadeId, accao, payload === undefined ? null : JSON.stringify(payload), new Date().toISOString())
}
