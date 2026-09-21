import type {
  Alerta,
  Clube,
  Competicao,
  Delegado,
  Epoca,
  EdicaoJogo,
  EstadoJogo,
  Indisponibilidade,
  Jogo,
  JogoDetalhado,
  JogoDoDelegado,
  NivelDelegado,
  NomeacaoExportada,
  LinhaKmDelegado,
  MatrizDashboard,
  LinhaRepeticoes,
  Nomeacao,
  NomeacaoDetalhada,
  Recinto,
  RepeticaoClube,
  VetoClube
} from '@shared/tipos'
import { MAX_SOMBRAS } from '@shared/tipos'
import { obterBaseDados, registarAuditoria } from './index'
import { dataHoraAGuardar, limiteDeTrabalho, vaiAcontecer } from '../../shared/datas'
import { normalizarNome } from '../fpf/html'
import { eRecintoPorIndicar } from '../fpf/recintoPorIndicar'
import { jogosQueColidem, type Folga } from '../sync/conflitos'

const agora = (): string => new Date().toISOString()
const bool = (v: unknown): boolean => v === 1 || v === true

// ---------------------------------------------------------------------------
// Delegados
// ---------------------------------------------------------------------------

type LinhaDelegado = {
  id: number
  numero: string
  nome: string
  morada: string | null
  lat: number | null
  lng: number | null
  nivel: string
  telefone: string | null
  email: string | null
  ativo: number
  notas: string | null
  coords_manuais: number
  apagado_em: string | null
}

const paraDelegado = (l: LinhaDelegado): Delegado => ({
  id: l.id,
  numero: l.numero,
  nome: l.nome,
  morada: l.morada,
  lat: l.lat,
  lng: l.lng,
  nivel: l.nivel as Delegado['nivel'],
  telefone: l.telefone,
  email: l.email,
  ativo: bool(l.ativo),
  notas: l.notas,
  coordsManuais: bool(l.coords_manuais),
  apagadoEm: l.apagado_em
})

/**
 * Os delegados, por número e numericamente: com ordenação de texto o 1084 vinha
 * antes do 109. O `CAST` dá 0 a números não numéricos, que ficam no início
 * ordenados pelo próprio texto.
 *
 * Os arquivados ficam de fora por omissão: saíram do quadro, mas continuam na
 * base de dados por causa das épocas que já fizeram.
 */
export function listarDelegados(incluirInativos = true, incluirArquivados = false): Delegado[] {
  const condicoes = [incluirInativos ? '' : 'ativo = 1', incluirArquivados ? '' : 'apagado_em IS NULL']
    .filter(Boolean)
    .join(' AND ')
  const sql = `
    SELECT * FROM delegado ${condicoes ? 'WHERE ' + condicoes : ''}
    ORDER BY CAST(numero AS INTEGER), numero, nome
  `
  return (obterBaseDados().prepare(sql).all() as LinhaDelegado[]).map(paraDelegado)
}

export function obterDelegado(id: number): Delegado | null {
  const linha = obterBaseDados().prepare('SELECT * FROM delegado WHERE id = ?').get(id) as
    | LinhaDelegado
    | undefined
  return linha ? paraDelegado(linha) : null
}

export type EntradaDelegado = Omit<Delegado, 'id'>

/**
 * Os campos que vão para a tabela, e só esses: o SQLite recusa parâmetros que a
 * consulta não use, e o `apagadoEm` do tipo não é um deles — quem arquiva é
 * `apagarDelegado`, não quem grava o formulário.
 */
function camposDoDelegado(dados: EntradaDelegado): Record<string, unknown> {
  return {
    numero: dados.numero,
    nome: dados.nome,
    morada: dados.morada,
    lat: dados.lat,
    lng: dados.lng,
    nivel: dados.nivel,
    telefone: dados.telefone,
    email: dados.email,
    ativo: dados.ativo ? 1 : 0,
    notas: dados.notas,
    coordsManuais: dados.coordsManuais ? 1 : 0
  }
}

export function criarDelegado(dados: EntradaDelegado): Delegado {
  const info = obterBaseDados()
    .prepare(
      `INSERT INTO delegado (numero, nome, morada, lat, lng, nivel, telefone, email, ativo, notas, coords_manuais)
       VALUES (@numero, @nome, @morada, @lat, @lng, @nivel, @telefone, @email, @ativo, @notas, @coordsManuais)`
    )
    .run(camposDoDelegado(dados))
  registarAuditoria('delegado', Number(info.lastInsertRowid), 'criar', dados)
  return obterDelegado(Number(info.lastInsertRowid))!
}

export function atualizarDelegado(id: number, dados: EntradaDelegado): Delegado {
  obterBaseDados()
    .prepare(
      `UPDATE delegado SET numero=@numero, nome=@nome, morada=@morada, lat=@lat, lng=@lng,
        nivel=@nivel, telefone=@telefone, email=@email, ativo=@ativo, notas=@notas,
        coords_manuais=@coordsManuais WHERE id=@id`
    )
    .run({ ...camposDoDelegado(dados), id })
  registarAuditoria('delegado', id, 'atualizar', dados)
  return obterDelegado(id)!
}

/**
 * Arquiva um delegado: sai das listas de trabalho e deixa de ser candidato,
 * mas fica na base de dados.
 *
 * Apagar a sério levava com ele todas as nomeações — a tabela tem
 * `ON DELETE CASCADE` — e com elas os km e os jogos das épocas passadas, que
 * são precisamente o histórico que se quer guardar.
 */
export function apagarDelegado(id: number): void {
  obterBaseDados()
    .prepare('UPDATE delegado SET apagado_em = ?, ativo = 0 WHERE id = ?')
    .run(agora(), id)
  registarAuditoria('delegado', id, 'arquivar')
}

/** Devolve ao quadro um delegado arquivado. Volta inativo: quem o arquivou que decida. */
export function restaurarDelegado(id: number): Delegado | null {
  obterBaseDados().prepare('UPDATE delegado SET apagado_em = NULL WHERE id = ?').run(id)
  registarAuditoria('delegado', id, 'restaurar')
  return obterDelegado(id)
}

export function listarIndisponibilidades(delegadoId: number): Indisponibilidade[] {
  return (
    obterBaseDados()
      .prepare('SELECT * FROM delegado_indisponibilidade WHERE delegado_id = ? ORDER BY data_inicio')
      .all(delegadoId) as { id: number; delegado_id: number; data_inicio: string; data_fim: string; motivo: string | null }[]
  ).map((l) => ({
    id: l.id,
    delegadoId: l.delegado_id,
    dataInicio: l.data_inicio,
    dataFim: l.data_fim,
    motivo: l.motivo
  }))
}

export function criarIndisponibilidade(dados: Omit<Indisponibilidade, 'id'>): void {
  obterBaseDados()
    .prepare(
      'INSERT INTO delegado_indisponibilidade (delegado_id, data_inicio, data_fim, motivo) VALUES (?, ?, ?, ?)'
    )
    .run(dados.delegadoId, dados.dataInicio, dados.dataFim, dados.motivo)
}

export function apagarIndisponibilidade(id: number): void {
  obterBaseDados().prepare('DELETE FROM delegado_indisponibilidade WHERE id = ?').run(id)
}

export function listarVetos(delegadoId: number): VetoClube[] {
  return (
    obterBaseDados()
      .prepare(
        `SELECT v.id, v.delegado_id, v.clube_id, v.motivo, c.nome AS clube_nome
         FROM delegado_veto_clube v JOIN clube c ON c.id = v.clube_id
         WHERE v.delegado_id = ? ORDER BY c.nome`
      )
      .all(delegadoId) as { id: number; delegado_id: number; clube_id: number; motivo: string | null; clube_nome: string }[]
  ).map((l) => ({
    id: l.id,
    delegadoId: l.delegado_id,
    clubeId: l.clube_id,
    clubeNome: l.clube_nome,
    motivo: l.motivo
  }))
}

export function criarVeto(dados: Omit<VetoClube, 'id' | 'clubeNome'>): void {
  obterBaseDados()
    .prepare('INSERT OR IGNORE INTO delegado_veto_clube (delegado_id, clube_id, motivo) VALUES (?, ?, ?)')
    .run(dados.delegadoId, dados.clubeId, dados.motivo)
}

export function apagarVeto(id: number): void {
  obterBaseDados().prepare('DELETE FROM delegado_veto_clube WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Épocas desportivas
// ---------------------------------------------------------------------------

const paraEpoca = (l: { season_id: number; descricao: string | null; criada_em: string }): Epoca => ({
  seasonId: l.season_id,
  descricao: l.descricao,
  criadaEm: l.criada_em
})

export function listarEpocas(): Epoca[] {
  return (
    obterBaseDados().prepare('SELECT * FROM epoca ORDER BY season_id DESC').all() as Parameters<
      typeof paraEpoca
    >[0][]
  ).map(paraEpoca)
}

export function obterEpoca(seasonId: number): Epoca | null {
  const l = obterBaseDados().prepare('SELECT * FROM epoca WHERE season_id = ?').get(seasonId) as
    | Parameters<typeof paraEpoca>[0]
    | undefined
  return l ? paraEpoca(l) : null
}

/**
 * Cria a época se ainda não existir, e diz se foi agora criada.
 *
 * É o que acontece quando se importam jogos de uma época que a aplicação ainda
 * não conhecia. A data de criação fica registada porque é dela que a
 * importação parte: os jogos anteriores pertencem à época que acabou.
 */
export function garantirEpoca(seasonId: number, descricao: string | null): { epoca: Epoca; nova: boolean } {
  const existente = obterEpoca(seasonId)
  if (existente) {
    // A descrição pode chegar mais tarde do que a época ("2027-2028").
    if (!existente.descricao && descricao) {
      obterBaseDados().prepare('UPDATE epoca SET descricao = ? WHERE season_id = ?').run(descricao, seasonId)
      return { epoca: { ...existente, descricao }, nova: false }
    }
    return { epoca: existente, nova: false }
  }
  obterBaseDados()
    .prepare('INSERT INTO epoca (season_id, descricao, criada_em) VALUES (?, ?, ?)')
    .run(seasonId, descricao, agora())
  registarAuditoria('epoca', seasonId, 'criar', { descricao })
  return { epoca: obterEpoca(seasonId)!, nova: true }
}

/**
 * A configuração que uma competição trazia da época anterior: nível exigido,
 * delegado assistente e se leva delegado em todos os jogos.
 *
 * Uma competição repete-se de época para época, e o coordenador não tem de
 * voltar a dizer o mesmo todos os anos. Procura-se pelo id da FPF e, se não
 * houver, pelo nome — o id muda de época para época em algumas competições.
 */
export function configuracaoDaEpocaAnterior(
  fpfCompetitionId: number | null,
  nome: string,
  seasonId: number
): Pick<Competicao, 'nivelMinimo' | 'usaDelegadoAssistente' | 'todosComDelegado'> | null {
  const db = obterBaseDados()
  const porId =
    fpfCompetitionId == null
      ? undefined
      : (db
          .prepare(
            `SELECT * FROM competicao WHERE fpf_competition_id = ? AND season_id < ?
              ORDER BY season_id DESC LIMIT 1`
          )
          .get(fpfCompetitionId, seasonId) as Parameters<typeof paraCompeticao>[0] | undefined)
  const linha =
    porId ??
    (db
      .prepare(
        `SELECT * FROM competicao WHERE nome = ? AND season_id < ? ORDER BY season_id DESC LIMIT 1`
      )
      .get(nome, seasonId) as Parameters<typeof paraCompeticao>[0] | undefined)
  if (!linha) return null
  const anterior = paraCompeticao(linha)
  return {
    nivelMinimo: anterior.nivelMinimo,
    usaDelegadoAssistente: anterior.usaDelegadoAssistente,
    todosComDelegado: anterior.todosComDelegado
  }
}

// ---------------------------------------------------------------------------
// Clubes e recintos
// ---------------------------------------------------------------------------

const paraClube = (l: { id: number; nome: string; nome_normalizado: string; notas: string | null }): Clube => ({
  id: l.id,
  nome: l.nome,
  nomeNormalizado: l.nome_normalizado,
  notas: l.notas
})

export function listarClubes(): Clube[] {
  return (obterBaseDados().prepare('SELECT * FROM clube ORDER BY nome').all() as Parameters<typeof paraClube>[0][]).map(
    paraClube
  )
}

export function encontrarOuCriarClube(nome: string): Clube {
  const db = obterBaseDados()
  const normalizado = normalizarNome(nome)
  const existente = db.prepare('SELECT * FROM clube WHERE nome_normalizado = ?').get(normalizado) as
    | Parameters<typeof paraClube>[0]
    | undefined
  if (existente) return paraClube(existente)
  const info = db.prepare('INSERT INTO clube (nome, nome_normalizado, notas) VALUES (?, ?, NULL)').run(nome, normalizado)
  return { id: Number(info.lastInsertRowid), nome, nomeNormalizado: normalizado, notas: null }
}

export function atualizarClube(id: number, nome: string, notas: string | null): void {
  obterBaseDados()
    .prepare('UPDATE clube SET nome = ?, nome_normalizado = ?, notas = ? WHERE id = ?')
    .run(nome, normalizarNome(nome), notas, id)
}

const paraRecinto = (l: {
  id: number
  nome: string
  morada: string | null
  lat: number | null
  lng: number | null
  coords_manuais: number
  geocodificado_em: string | null
  origem_coords: string | null
  morada_resolvida: string | null
  confianca: string | null
  confirmado: number
  clubes?: string | null
}): Recinto => ({
  id: l.id,
  nome: l.nome,
  morada: l.morada,
  lat: l.lat,
  lng: l.lng,
  coordsManuais: bool(l.coords_manuais),
  geocodificadoEm: l.geocodificado_em,
  origemCoords: l.origem_coords as Recinto['origemCoords'],
  confianca: l.confianca as Recinto['confianca'],
  moradaResolvida: l.morada_resolvida,
  confirmado: bool(l.confirmado),
  clubes: l.clubes ? l.clubes.split('||') : []
})

const SQL_RECINTO = `
  SELECT r.*, (
    SELECT group_concat(c.nome, '||') FROM clube_recinto cr
    JOIN clube c ON c.id = cr.clube_id WHERE cr.recinto_id = r.id
  ) AS clubes
  FROM recinto r
`

export function listarRecintos(): Recinto[] {
  return (
    obterBaseDados().prepare(`${SQL_RECINTO} ORDER BY r.nome`).all() as Parameters<typeof paraRecinto>[0][]
  ).map(paraRecinto)
}

/** Recintos ainda sem ponto no mapa — os que a geocodificação em lote trata. */
export function recintosSemCoordenadas(): Recinto[] {
  return (
    obterBaseDados()
      .prepare(`${SQL_RECINTO} WHERE r.lat IS NULL OR r.lng IS NULL ORDER BY r.nome`)
      .all() as Parameters<typeof paraRecinto>[0][]
  ).map(paraRecinto)
}

/** Grava as coordenadas obtidas automaticamente, sempre por confirmar. */
export function guardarCoordenadasAutomaticas(
  id: number,
  dados: { lat: number; lng: number; origem: string; moradaResolvida: string; confianca: string }
): void {
  obterBaseDados()
    .prepare(
      `UPDATE recinto SET lat = ?, lng = ?, origem_coords = ?, morada_resolvida = ?, confianca = ?,
        geocodificado_em = ?, coords_manuais = 0, confirmado = 0 WHERE id = ?`
    )
    .run(dados.lat, dados.lng, dados.origem, dados.moradaResolvida, dados.confianca, agora(), id)
}

export function confirmarRecinto(id: number, confirmado: boolean): void {
  obterBaseDados().prepare('UPDATE recinto SET confirmado = ? WHERE id = ?').run(confirmado ? 1 : 0, id)
}

export function confirmarTodosRecintos(): void {
  obterBaseDados().prepare('UPDATE recinto SET confirmado = 1 WHERE lat IS NOT NULL').run()
}

export function obterRecinto(id: number): Recinto | null {
  const l = obterBaseDados().prepare(`${SQL_RECINTO} WHERE r.id = ?`).get(id) as
    | Parameters<typeof paraRecinto>[0]
    | undefined
  return l ? paraRecinto(l) : null
}

export function encontrarOuCriarRecinto(nome: string): Recinto {
  const db = obterBaseDados()
  const normalizado = normalizarNome(nome)
  const existente = db.prepare('SELECT * FROM recinto WHERE nome_normalizado = ?').get(normalizado) as
    | Parameters<typeof paraRecinto>[0]
    | undefined
  if (existente) return paraRecinto(existente)
  const info = db
    .prepare('INSERT INTO recinto (nome, nome_normalizado, morada) VALUES (?, ?, NULL)')
    .run(nome, normalizado)
  return obterRecinto(Number(info.lastInsertRowid))!
}

export function atualizarRecinto(
  id: number,
  dados: { nome: string; morada: string | null; lat: number | null; lng: number | null; coordsManuais: boolean }
): Recinto {
  obterBaseDados()
    .prepare(
      `UPDATE recinto SET nome = ?, nome_normalizado = ?, morada = ?, lat = ?, lng = ?,
        coords_manuais = ?, geocodificado_em = ?,
        origem_coords = CASE WHEN ? = 1 THEN 'MANUAL' ELSE origem_coords END,
        confirmado = CASE WHEN ? = 1 THEN 1 ELSE confirmado END
       WHERE id = ?`
    )
    .run(
      dados.nome,
      normalizarNome(dados.nome),
      dados.morada,
      dados.lat,
      dados.lng,
      dados.coordsManuais ? 1 : 0,
      dados.lat != null ? agora() : null,
      dados.coordsManuais ? 1 : 0,
      dados.coordsManuais ? 1 : 0,
      id
    )
  return obterRecinto(id)!
}

/** Recinto de um clube: o específico da competição, se existir, senão o de omissão. */
export function recintoDoClube(clubeId: number, competicaoId: number | null): number | null {
  const linha = obterBaseDados()
    .prepare(
      `SELECT recinto_id FROM clube_recinto
       WHERE clube_id = ? AND (competicao_id = ? OR competicao_id IS NULL)
       ORDER BY competicao_id IS NULL
       LIMIT 1`
    )
    .get(clubeId, competicaoId) as { recinto_id: number } | undefined
  return linha?.recinto_id ?? null
}

/**
 * Em que recinto se joga um jogo: o que a FPF indica, e nada mais.
 *
 * Se a FPF diz "a indicar" (ou não diz nada), o jogo fica por indicar — não se
 * vai buscar o recinto habitual do clube nem nenhuma outra escolha local. Os
 * recintos só existem na aplicação por causa das coordenadas, para calcular os
 * km; quem decide onde se joga é a FPF.
 *
 * A regra antiga dava prioridade ao recinto habitual do clube, e um clube joga
 * em sítios diferentes consoante a equipa — a B no estádio, os sub-19 na
 * academia, o feminino noutro pavilhão. Resultado: 134 de 744 jogos futuros
 * estavam com o recinto errado, e com eles as distâncias e os km.
 */
export function resolverRecinto(
  clubeCasaId: number,
  _competicaoId: number,
  recintoTexto: string | null
): number | null {
  if (eRecintoPorIndicar(recintoTexto)) return null
  const recinto = encontrarOuCriarRecinto(recintoTexto!.trim())
  // O primeiro recinto conhecido de um clube fica registado como o habitual
  // dele, só como referência no ecrã de clubes. Não entra na decisão acima.
  if (recintoDoClube(clubeCasaId, null) == null) definirRecintoDoClube(clubeCasaId, null, recinto.id)
  return recinto.id
}

export interface RecintoCorrigido {
  jogoId: number
  temNomeacoes: boolean
}

/**
 * Põe cada jogo futuro da FPF no recinto que a FPF indica.
 *
 * Existe para reparar os jogos gravados com a regra antiga: a sincronização só
 * reescreve jogos cujo texto mudou, e esses tinham o texto certo e o recinto
 * errado — nunca seriam corrigidos sozinhos. Corre a seguir a cada atualização.
 *
 * Só toca em jogos vindos da FPF (com id de jornada): os criados à mão ou por
 * ficheiro têm o recinto escolhido pelo coordenador, e não há texto da FPF que
 * os corrija. Também não mexe em jogos corrigidos à mão nem em jogos passados.
 */
export function reconciliarRecintos(desde = limiteDeTrabalho()): RecintoCorrigido[] {
  const db = obterBaseDados()
  const linhas = db
    .prepare(
      `SELECT id, clube_casa_id, competicao_id, recinto_id, recinto_texto_fpf
         FROM jogo
        WHERE editado_manualmente = 0 AND fpf_fixture_id IS NOT NULL AND data_hora >= ?`
    )
    .all(desde) as {
    id: number
    clube_casa_id: number
    competicao_id: number
    recinto_id: number | null
    recinto_texto_fpf: string | null
  }[]

  const atualizar = db.prepare(
    `UPDATE jogo SET recinto_id = ?, alterado_em = ?,
       ultima_alteracao = COALESCE(?, ultima_alteracao)
     WHERE id = ?`
  )
  const corrigidos: RecintoCorrigido[] = []
  db.transaction(() => {
    for (const l of linhas) {
      const certo = resolverRecinto(l.clube_casa_id, l.competicao_id, l.recinto_texto_fpf)
      if (certo === l.recinto_id) continue
      const antes = obterJogoDetalhado(l.id)
      if (!antes) continue
      const alteracao = descreverAlteracao(antes, {
        dataHora: antes.dataHora,
        recintoId: certo,
        jornada: antes.jornada
      })
      atualizar.run(certo, agora(), alteracao, l.id)
      associarRecintoDoJogo(l.clube_casa_id, l.competicao_id, certo)
      corrigidos.push({ jogoId: l.id, temNomeacoes: antes.nomeacoes.length > 0 })
    }
  })()
  return corrigidos
}

export function definirRecintoDoClube(clubeId: number, competicaoId: number | null, recintoId: number): void {
  const db = obterBaseDados()
  if (competicaoId == null) {
    db.prepare(
      `INSERT INTO clube_recinto (clube_id, competicao_id, recinto_id) VALUES (?, NULL, ?)
       ON CONFLICT(clube_id) WHERE competicao_id IS NULL DO UPDATE SET recinto_id = excluded.recinto_id`
    ).run(clubeId, recintoId)
  } else {
    db.prepare(
      `INSERT INTO clube_recinto (clube_id, competicao_id, recinto_id) VALUES (?, ?, ?)
       ON CONFLICT(clube_id, competicao_id) WHERE competicao_id IS NOT NULL
       DO UPDATE SET recinto_id = excluded.recinto_id`
    ).run(clubeId, competicaoId, recintoId)
  }
}

export interface RecintoDoClube {
  id: number
  competicaoId: number | null
  competicaoNome: string | null
  recintoId: number
  recintoNome: string
}

export function listarRecintosDoClube(clubeId: number): RecintoDoClube[] {
  return obterBaseDados()
    .prepare(
      `SELECT cr.id, cr.competicao_id AS competicaoId, comp.nome AS competicaoNome,
              cr.recinto_id AS recintoId, r.nome AS recintoNome
       FROM clube_recinto cr
       JOIN recinto r ON r.id = cr.recinto_id
       LEFT JOIN competicao comp ON comp.id = cr.competicao_id
       WHERE cr.clube_id = ?
       ORDER BY cr.competicao_id IS NULL DESC, comp.nome`
    )
    .all(clubeId) as RecintoDoClube[]
}

export function apagarRecintoDoClube(id: number): void {
  obterBaseDados().prepare('DELETE FROM clube_recinto WHERE id = ?').run(id)
}

/**
 * Regista o recinto de um jogo na lista de recintos do clube da casa, para a
 * competição do jogo — só se o clube ainda não tiver recinto para essa
 * competição. Assim a lista fica a mostrar onde cada clube joga em cada
 * competição (a equipa B no estádio, os sub-19 na academia...).
 *
 * Nunca substitui uma associação que já exista, seja escolhida pelo coordenador
 * ou registada antes. E é só informativa: o recinto de cada jogo continua a
 * ser o que a FPF indica (ver `resolverRecinto`).
 */
export function associarRecintoDoJogo(clubeCasaId: number, competicaoId: number, recintoId: number | null): void {
  if (recintoId == null) return
  obterBaseDados()
    .prepare(
      `INSERT INTO clube_recinto (clube_id, competicao_id, recinto_id) VALUES (?, ?, ?)
       ON CONFLICT(clube_id, competicao_id) WHERE competicao_id IS NOT NULL DO NOTHING`
    )
    .run(clubeCasaId, competicaoId, recintoId)
}

// ---------------------------------------------------------------------------
// Competições
// ---------------------------------------------------------------------------

const paraCompeticao = (l: {
  id: number
  fpf_competition_id: number | null
  season_id: number
  season_descricao: string | null
  nome: string
  organizacao: string | null
  ativa: number
  nivel_minimo: string | null
  usa_delegado_assistente: number
  todos_com_delegado: number
}): Competicao => ({
  id: l.id,
  fpfCompetitionId: l.fpf_competition_id,
  seasonId: l.season_id,
  seasonDescricao: l.season_descricao,
  nome: l.nome,
  organizacao: l.organizacao,
  ativa: bool(l.ativa),
  nivelMinimo: l.nivel_minimo as Competicao['nivelMinimo'],
  usaDelegadoAssistente: bool(l.usa_delegado_assistente),
  todosComDelegado: bool(l.todos_com_delegado)
})

export function listarCompeticoes(seasonId?: number): Competicao[] {
  const db = obterBaseDados()
  const linhas = (
    seasonId != null
      ? db.prepare('SELECT * FROM competicao WHERE season_id = ? ORDER BY nome').all(seasonId)
      : db.prepare('SELECT * FROM competicao ORDER BY season_id DESC, nome').all()
  ) as Parameters<typeof paraCompeticao>[0][]
  return linhas.map(paraCompeticao)
}

export function guardarCompeticao(dados: Omit<Competicao, 'id'> & { id?: number }): Competicao {
  const db = obterBaseDados()
  const params = {
    fpfCompetitionId: dados.fpfCompetitionId,
    seasonId: dados.seasonId,
    seasonDescricao: dados.seasonDescricao,
    nome: dados.nome,
    organizacao: dados.organizacao,
    ativa: dados.ativa ? 1 : 0,
    nivelMinimo: dados.nivelMinimo,
    usaDelegadoAssistente: dados.usaDelegadoAssistente ? 1 : 0,
    todosComDelegado: dados.todosComDelegado ? 1 : 0
  }
  if (dados.id) {
    db.prepare(
      `UPDATE competicao SET fpf_competition_id=@fpfCompetitionId, season_id=@seasonId,
        season_descricao=@seasonDescricao, nome=@nome, organizacao=@organizacao, ativa=@ativa,
        nivel_minimo=@nivelMinimo, usa_delegado_assistente=@usaDelegadoAssistente,
        todos_com_delegado=@todosComDelegado WHERE id=@id`
    ).run({ ...params, id: dados.id })
    return listarCompeticoes().find((c) => c.id === dados.id)!
  }
  // `RETURNING` é essencial aqui: num `ON CONFLICT DO UPDATE` o SQLite não mexe
  // no `last_insert_rowid()`, que fica com o valor de um INSERT anterior. Com a
  // leitura antiga, resincronizar devolvia a mesma competição várias vezes — o
  // contador de progresso disparava e só uma competição era lida de facto.
  const linha = db
    .prepare(
      `INSERT INTO competicao (fpf_competition_id, season_id, season_descricao, nome, organizacao,
         ativa, nivel_minimo, usa_delegado_assistente, todos_com_delegado)
       VALUES (@fpfCompetitionId, @seasonId, @seasonDescricao, @nome, @organizacao, @ativa,
         @nivelMinimo, @usaDelegadoAssistente, @todosComDelegado)
       ON CONFLICT(fpf_competition_id, season_id) DO UPDATE SET
         nome = excluded.nome, organizacao = excluded.organizacao, ativa = excluded.ativa,
         season_descricao = COALESCE(excluded.season_descricao, competicao.season_descricao)
         -- todos_com_delegado fica de fora: é uma decisão do coordenador, e
         -- uma resincronização não pode desfazê-la.
       RETURNING id`
    )
    .get(params) as { id: number } | undefined

  const id =
    linha?.id ??
    (
      db
        .prepare('SELECT id FROM competicao WHERE fpf_competition_id IS ? AND season_id = ?')
        .get(dados.fpfCompetitionId, dados.seasonId) as { id: number }
    ).id
  return listarCompeticoes().find((c) => c.id === id)!
}

export function apagarCompeticao(id: number): void {
  obterBaseDados().prepare('DELETE FROM competicao WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Jogos
// ---------------------------------------------------------------------------

type LinhaJogo = {
  id: number
  chave_natural: string
  competicao_id: number
  fase: string | null
  serie: string | null
  jornada: string | null
  fpf_fixture_id: number | null
  fpf_match_id: number | null
  data_hora: string | null
  clube_casa_id: number
  clube_fora_id: number
  recinto_id: number | null
  recinto_texto_fpf: string | null
  estado: string
  importado_em: string | null
  alterado_em: string | null
  escondido: number
  escondido_em: string | null
  leva_delegado: number | null
  editado_manualmente: number
  editado_em: string | null
  ultima_alteracao: string | null
}

const paraJogo = (l: LinhaJogo): Jogo => ({
  id: l.id,
  chaveNatural: l.chave_natural,
  competicaoId: l.competicao_id,
  fase: l.fase,
  serie: l.serie,
  jornada: l.jornada,
  fpfFixtureId: l.fpf_fixture_id,
  fpfMatchId: l.fpf_match_id,
  dataHora: l.data_hora,
  clubeCasaId: l.clube_casa_id,
  clubeForaId: l.clube_fora_id,
  recintoId: l.recinto_id,
  recintoTextoFpf: l.recinto_texto_fpf,
  estado: l.estado as EstadoJogo,
  importadoEm: l.importado_em,
  alteradoEm: l.alterado_em,
  escondido: !!l.escondido,
  escondidoEm: l.escondido_em,
  levaDelegado: l.leva_delegado == null ? null : !!l.leva_delegado,
  editadoManualmente: !!l.editado_manualmente,
  editadoEm: l.editado_em,
  ultimaAlteracao: l.ultima_alteracao
})

export interface FiltroJogos {
  /** `true` devolve **apenas** os escondidos; por omissão são omitidos. */
  escondidos?: boolean
  /**
   * Que jogos devolver quanto a levarem delegado:
   * `'COM'` (por omissão) só os que levam, `'SEM'` só os outros, `'TODOS'` tudo.
   */
  levaDelegado?: 'COM' | 'SEM' | 'TODOS'
  de?: string
  ate?: string
  competicaoId?: number
  /** 'TODOS' | 'POR_NOMEAR' | 'PARCIAL' | 'COMPLETO' */
  estadoNomeacao?: string
  texto?: string
}

const SQL_JOGO_DETALHADO = `
  SELECT j.*, comp.nome AS competicao_nome, comp.usa_delegado_assistente,
         cc.nome AS clube_casa_nome, cf.nome AS clube_fora_nome,
         r.nome AS recinto_nome, r.lat AS recinto_lat, r.lng AS recinto_lng
  FROM jogo j
  JOIN competicao comp ON comp.id = j.competicao_id
  JOIN clube cc ON cc.id = j.clube_casa_id
  JOIN clube cf ON cf.id = j.clube_fora_id
  LEFT JOIN recinto r ON r.id = j.recinto_id
`

export function listarJogos(filtro: FiltroJogos = {}): JogoDetalhado[] {
  const condicoes: string[] = []
  const params: Record<string, unknown> = {}
  if (filtro.de) {
    condicoes.push('j.data_hora >= @de')
    params.de = filtro.de
  }
  if (filtro.ate) {
    condicoes.push('j.data_hora <= @ate')
    params.ate = filtro.ate
  }
  if (filtro.competicaoId) {
    condicoes.push('j.competicao_id = @competicaoId')
    params.competicaoId = filtro.competicaoId
  }
  if (filtro.texto) {
    condicoes.push('(cc.nome LIKE @texto OR cf.nome LIKE @texto OR r.nome LIKE @texto)')
    params.texto = `%${filtro.texto}%`
  }
  // Os escondidos ficam de fora de tudo menos de quem os peça de propósito.
  condicoes.push(filtro.escondidos ? 'j.escondido = 1' : 'j.escondido = 0')

  // Nas competições em que todos os jogos levam delegado, o jogo entra sozinho;
  // nas outras, só se o coordenador o tiver marcado. `leva_delegado` a NULL
  // segue a competição, e um valor guardado manda sobre ela.
  const LEVA = 'COALESCE(j.leva_delegado, comp.todos_com_delegado) = 1'
  if (filtro.levaDelegado === 'SEM') condicoes.push(`NOT (${LEVA})`)
  else if (filtro.levaDelegado !== 'TODOS') condicoes.push(LEVA)
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
  const linhas = obterBaseDados()
    .prepare(`${SQL_JOGO_DETALHADO} ${where} ORDER BY j.data_hora, comp.nome`)
    .all(params) as (LinhaJogo & {
    competicao_nome: string
    usa_delegado_assistente: number
    clube_casa_nome: string
    clube_fora_nome: string
    recinto_nome: string | null
    recinto_lat: number | null
    recinto_lng: number | null
  })[]

  const nomeacoesPorJogo = agruparNomeacoes(linhas.map((l) => l.id))

  const jogos = linhas.map((l) => ({
    ...paraJogo(l),
    competicaoNome: l.competicao_nome,
    clubeCasaNome: l.clube_casa_nome,
    clubeForaNome: l.clube_fora_nome,
    recintoNome: l.recinto_nome,
    recintoLat: l.recinto_lat,
    recintoLng: l.recinto_lng,
    nomeacoes: nomeacoesPorJogo.get(l.id) ?? []
  }))

  if (!filtro.estadoNomeacao || filtro.estadoNomeacao === 'TODOS') return jogos
  return jogos.filter((j) => {
    const n = j.nomeacoes.length
    if (filtro.estadoNomeacao === 'POR_NOMEAR') return n === 0
    if (filtro.estadoNomeacao === 'PARCIAL') return n === 1
    if (filtro.estadoNomeacao === 'COMPLETO') return n >= 2
    return true
  })
}

/**
 * Esconder é reversível e não apaga nada: o jogo sai das listas de trabalho e
 * fica no ecrã Escondidos até a data passar. Nomeações que existam ficam como
 * estão — se o jogo voltar, volta como estava.
 */
/**
 * Marca (ou desmarca) um jogo como levando delegado, à margem da competição.
 *
 * `null` devolve o jogo à regra da competição. É assim que se acrescenta à
 * lista de trabalho um jogo da Taça, ou se tira um jogo de uma competição em
 * que os restantes levam todos delegado.
 */
export function definirLevaDelegado(id: number, leva: boolean | null): void {
  obterBaseDados()
    .prepare('UPDATE jogo SET leva_delegado = ? WHERE id = ?')
    .run(leva == null ? null : leva ? 1 : 0, id)
  registarAuditoria('jogo', id, 'leva-delegado', { leva })
}

export function esconderJogo(id: number, escondido: boolean): void {
  obterBaseDados()
    .prepare('UPDATE jogo SET escondido = ?, escondido_em = ? WHERE id = ?')
    .run(escondido ? 1 : 0, escondido ? agora() : null, id)
  registarAuditoria('jogo', id, escondido ? 'esconder' : 'repor')
}

/**
 * Jogos escondidos que ainda estão para acontecer. Os que já passaram deixam de
 * aparecer — foram escondidos por não interessarem, e depois da data deixam de
 * poder interessar de todo.
 */
export function jogosEscondidos(desde = limiteDeTrabalho()): JogoDetalhado[] {
  return listarJogos({ escondidos: true, de: desde })
}

/**
 * Histórico: jogos que já se realizaram e tiveram delegado nomeado. É o registo
 * da época — o que ficou para trás sem nomeação não conta para nada e por isso
 * não aparece aqui.
 */
export function historicoJogos(filtro: FiltroJogos = {}): JogoDetalhado[] {
  // Só entra o que já ficou para trás: um `ate` pedido para lá da fronteira
  // das quatro horas é cortado nela, venha de onde vier o filtro.
  const limite = limiteDeTrabalho()
  const ate = filtro.ate && filtro.ate < limite ? filtro.ate : limite
  // Entram os jogos que deviam ter levado delegado, tenham levado ou não: nas
  // competições em que todos levam, um jogo que passou sem ninguém nomeado é
  // precisamente o que interessa ver. Nas outras, entram só os que o
  // coordenador escolheu — `listarJogos` já aplica essa regra.
  return listarJogos({ ...filtro, ate }).reverse()
}

/**
 * Vai buscar um jogo pelo id. Está no caminho crítico da nomeação, por isso é
 * uma consulta direta — com uma época inteira importada, varrer a lista toda
 * custava caro a cada clique.
 */
export function obterJogoDetalhado(id: number): JogoDetalhado | null {
  const l = obterBaseDados().prepare(`${SQL_JOGO_DETALHADO} WHERE j.id = ?`).get(id) as
    | (LinhaJogo & {
        competicao_nome: string
        clube_casa_nome: string
        clube_fora_nome: string
        recinto_nome: string | null
        recinto_lat: number | null
        recinto_lng: number | null
      })
    | undefined
  if (!l) return null
  return {
    ...paraJogo(l),
    competicaoNome: l.competicao_nome,
    clubeCasaNome: l.clube_casa_nome,
    clubeForaNome: l.clube_fora_nome,
    recintoNome: l.recinto_nome,
    recintoLat: l.recinto_lat,
    recintoLng: l.recinto_lng,
    nomeacoes: listarNomeacoesDoJogo(id)
  }
}

export interface EntradaJogo {
  chaveNatural: string
  competicaoId: number
  fase: string | null
  serie: string | null
  jornada: string | null
  fpfFixtureId: number | null
  fpfMatchId: number | null
  dataHora: string | null
  clubeCasaId: number
  clubeForaId: number
  recintoId: number | null
  recintoTextoFpf: string | null
  estado: EstadoJogo
}

export function obterJogoPorChave(chave: string): Jogo | null {
  const l = obterBaseDados().prepare('SELECT * FROM jogo WHERE chave_natural = ?').get(chave) as
    | LinhaJogo
    | undefined
  return l ? paraJogo(l) : null
}

/** Resumo legível do que mudou entre dois estados de um jogo. */
export function descreverAlteracao(
  antes: { dataHora: string | null; recintoId: number | null; jornada: string | null },
  depois: { dataHora: string | null; recintoId: number | null; jornada: string | null }
): string | null {
  const partes: string[] = []
  const dia = (d: string | null): string => (d ? d.replace('T', ' às ') : 'sem data')
  if (antes.dataHora !== depois.dataHora) partes.push(`data ${dia(antes.dataHora)} → ${dia(depois.dataHora)}`)
  if (antes.recintoId !== depois.recintoId) {
    const nome = (id: number | null): string => (id ? (obterRecinto(id)?.nome ?? 'recinto') : 'sem recinto')
    partes.push(`recinto ${nome(antes.recintoId)} → ${nome(depois.recintoId)}`)
  }
  if (antes.jornada !== depois.jornada) {
    partes.push(`jornada ${antes.jornada ?? '—'} → ${depois.jornada ?? '—'}`)
  }
  return partes.length ? partes.join(' · ') : null
}

export function guardarJogo(dados: EntradaJogo): number {
  const db = obterBaseDados()
  const existente = obterJogoPorChave(dados.chaveNatural)
  if (existente) {
    // Um jogo corrigido à mão passa a mandar sobre a FPF: se a atualização lhe
    // tocasse, a correção desaparecia na hora seguinte sem ninguém dar por isso.
    if (existente.editadoManualmente) return existente.id

    // Um jogo já jogado deixa de mostrar a hora no site da FPF, e a leitura
    // devolve `T00:00`. Guardar isso apagava a hora real.
    const comHora = { ...dados, dataHora: dataHoraAGuardar(existente.dataHora, dados.dataHora) }
    const alteracao = descreverAlteracao(existente, comHora)
    db.prepare(
      `UPDATE jogo SET fase=@fase, serie=@serie, jornada=@jornada, fpf_fixture_id=@fpfFixtureId,
        fpf_match_id=@fpfMatchId, data_hora=@dataHora, recinto_id=@recintoId,
        recinto_texto_fpf=@recintoTextoFpf, estado=@estado, alterado_em=@alteradoEm,
        ultima_alteracao=COALESCE(@alteracao, ultima_alteracao)
       WHERE id=@id`
    ).run({ ...comHora, id: existente.id, alteradoEm: agora(), alteracao })
    associarRecintoDoJogo(dados.clubeCasaId, dados.competicaoId, dados.recintoId)
    return existente.id
  }
  const info = db
    .prepare(
      `INSERT INTO jogo (chave_natural, competicao_id, fase, serie, jornada, fpf_fixture_id, fpf_match_id,
        data_hora, clube_casa_id, clube_fora_id, recinto_id, recinto_texto_fpf, estado, importado_em)
       VALUES (@chaveNatural, @competicaoId, @fase, @serie, @jornada, @fpfFixtureId, @fpfMatchId,
        @dataHora, @clubeCasaId, @clubeForaId, @recintoId, @recintoTextoFpf, @estado, @importadoEm)`
    )
    .run({ ...dados, importadoEm: agora() })
  associarRecintoDoJogo(dados.clubeCasaId, dados.competicaoId, dados.recintoId)
  return Number(info.lastInsertRowid)
}

/**
 * Corrige um jogo à mão: data, hora, recinto ou jornada.
 *
 * A partir daqui a sincronização deixa de lhe tocar. É a única forma de a
 * correção sobreviver: a FPF continuaria a mandar o que tem, e a atualização
 * seguinte desfazia tudo. As nomeações que existam ficam como estão — mudar a
 * hora de um jogo não é motivo para desnomear ninguém.
 */
export function editarJogo(id: number, dados: EdicaoJogo): JogoDetalhado | null {
  const antes = obterJogoDetalhado(id)
  if (!antes) return null
  const alteracao = descreverAlteracao(antes, dados)
  obterBaseDados()
    .prepare(
      `UPDATE jogo SET data_hora=@dataHora, recinto_id=@recintoId, jornada=@jornada,
         editado_manualmente=1, editado_em=@quando, alterado_em=@quando,
         ultima_alteracao=COALESCE(@alteracao, ultima_alteracao)
       WHERE id=@id`
    )
    .run({ ...dados, id, quando: agora(), alteracao })
  associarRecintoDoJogo(antes.clubeCasaId, antes.competicaoId, dados.recintoId)
  registarAuditoria('jogo', id, 'editar', { antes: alteracao, dados })
  return obterJogoDetalhado(id)
}

/** Devolve o jogo ao controlo da FPF: volta a ser atualizado nas sincronizações. */
export function seguirFpfDeNovo(id: number): JogoDetalhado | null {
  obterBaseDados()
    .prepare('UPDATE jogo SET editado_manualmente = 0, editado_em = NULL WHERE id = ?')
    .run(id)
  registarAuditoria('jogo', id, 'seguir-fpf')
  return obterJogoDetalhado(id)
}

export function apagarJogo(id: number): void {
  obterBaseDados().prepare('DELETE FROM jogo WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Nomeações
// ---------------------------------------------------------------------------

type LinhaNomeacao = {
  id: number
  jogo_id: number
  delegado_id: number
  papel: string
  km: number | null
  minutos: number | null
  fonte_distancia: string | null
  estado: string
  motivo_override: string | null
  criado_em: string
  numero: string
  nome: string
  nivel: string
}

const paraNomeacao = (l: LinhaNomeacao): NomeacaoDetalhada => ({
  id: l.id,
  jogoId: l.jogo_id,
  delegadoId: l.delegado_id,
  papel: l.papel as Nomeacao['papel'],
  km: l.km,
  minutos: l.minutos,
  fonteDistancia: l.fonte_distancia as Nomeacao['fonteDistancia'],
  estado: l.estado as Nomeacao['estado'],
  motivoOverride: l.motivo_override,
  criadoEm: l.criado_em,
  delegadoNumero: l.numero,
  delegadoNome: l.nome,
  delegadoNivel: l.nivel as NomeacaoDetalhada['delegadoNivel']
})

function agruparNomeacoes(jogoIds: number[]): Map<number, NomeacaoDetalhada[]> {
  const mapa = new Map<number, NomeacaoDetalhada[]>()
  if (!jogoIds.length) return mapa
  const marcadores = jogoIds.map(() => '?').join(',')
  const linhas = obterBaseDados()
    .prepare(
      `SELECT n.*, d.numero, d.nome, d.nivel FROM nomeacao n
       JOIN delegado d ON d.id = n.delegado_id
       WHERE n.estado <> 'CANCELADA' AND n.jogo_id IN (${marcadores})
       ORDER BY CASE n.papel WHEN 'PRINCIPAL' THEN 0 WHEN 'ASSISTENTE' THEN 1 ELSE 2 END, n.id`
    )
    .all(...jogoIds) as LinhaNomeacao[]
  for (const linha of linhas) {
    const lista = mapa.get(linha.jogo_id) ?? []
    lista.push(paraNomeacao(linha))
    mapa.set(linha.jogo_id, lista)
  }
  return mapa
}

export function listarNomeacoesDoJogo(jogoId: number): NomeacaoDetalhada[] {
  return (
    obterBaseDados()
      .prepare(
        `SELECT n.*, d.numero, d.nome, d.nivel FROM nomeacao n
         JOIN delegado d ON d.id = n.delegado_id
         WHERE n.jogo_id = ? AND n.estado <> 'CANCELADA' ORDER BY CASE n.papel WHEN 'PRINCIPAL' THEN 0 WHEN 'ASSISTENTE' THEN 1 ELSE 2 END, n.id`
      )
      .all(jogoId) as LinhaNomeacao[]
  ).map(paraNomeacao)
}

export interface EntradaNomeacao {
  jogoId: number
  delegadoId: number
  papel: Nomeacao['papel']
  km: number | null
  minutos: number | null
  fonteDistancia: Nomeacao['fonteDistancia']
  estado: Nomeacao['estado']
  motivoOverride: string | null
}

export function guardarNomeacao(dados: EntradaNomeacao): number {
  const db = obterBaseDados()
  const transacao = db.transaction(() => {
    if (dados.papel === 'SOMBRA') {
      // As sombras são várias: só se evita repetir a mesma pessoa no mesmo jogo.
      db.prepare(
        `DELETE FROM nomeacao WHERE jogo_id = ? AND papel = 'SOMBRA' AND delegado_id = ? AND estado <> 'CANCELADA'`
      ).run(dados.jogoId, dados.delegadoId)
      const { n } = db
        .prepare(
          `SELECT COUNT(*) AS n FROM nomeacao WHERE jogo_id = ? AND papel = 'SOMBRA' AND estado <> 'CANCELADA'`
        )
        .get(dados.jogoId) as { n: number }
      if (n >= MAX_SOMBRAS) {
        throw new Error(`Um jogo pode ter no máximo ${MAX_SOMBRAS} delegados sombra.`)
      }
    } else {
      // Principal e assistente são um por jogo: o novo substitui o que lá estava.
      db.prepare(`DELETE FROM nomeacao WHERE jogo_id = ? AND papel = ? AND estado <> 'CANCELADA'`).run(
        dados.jogoId,
        dados.papel
      )
    }
    const info = db
      .prepare(
        `INSERT INTO nomeacao (jogo_id, delegado_id, papel, km, minutos, fonte_distancia, estado, motivo_override, criado_em)
         VALUES (@jogoId, @delegadoId, @papel, @km, @minutos, @fonteDistancia, @estado, @motivoOverride, @criadoEm)`
      )
      .run({ ...dados, criadoEm: agora() })
    return Number(info.lastInsertRowid)
  })
  const id = transacao()
  registarAuditoria('nomeacao', id, 'guardar', dados)
  return id
}

/**
 * Acerta os km de uma nomeação. Só se usa quando o recinto de um jogo ainda
 * por realizar muda: o delegado vai ao recinto novo, e os km da época têm de
 * contar essa viagem, não a antiga.
 */
export function atualizarKmNomeacao(
  id: number,
  km: number | null,
  minutos: number | null,
  fonte: string | null
): void {
  obterBaseDados()
    .prepare('UPDATE nomeacao SET km = ?, minutos = ?, fonte_distancia = ? WHERE id = ?')
    .run(km, minutos, fonte, id)
}

/**
 * Jogos com nomeações ainda sem quilómetros.
 *
 * Acontece com o histórico semeado, que entra sem distâncias: calculá-las no
 * arranque atrasaria a abertura, e são centenas de consultas ao serviço de
 * rotas. Ficam para segundo plano, e esta consulta diz o que falta.
 */
export function jogosComNomeacoesSemKm(): number[] {
  return (
    obterBaseDados()
      .prepare(
        `SELECT DISTINCT n.jogo_id AS id FROM nomeacao n
           JOIN jogo j ON j.id = n.jogo_id
          WHERE n.km IS NULL AND n.estado = 'CONFIRMADA' AND j.recinto_id IS NOT NULL
          ORDER BY j.data_hora DESC`
      )
      .all() as { id: number }[]
  ).map((l) => l.id)
}

/** Quantas nomeações existem, para avisar antes de as apagar. */
export function contarNomeacoes(): number {
  const linha = obterBaseDados().prepare('SELECT COUNT(*) AS n FROM nomeacao').get() as { n: number }
  return linha.n
}

/**
 * Apaga **todas** as nomeações — o que se usa para limpar os dados de uma fase
 * de testes e começar a época a sério.
 *
 * Só mexe na tabela de nomeações: delegados, clubes, recintos e jogos ficam
 * como estão. Os km da época e as contagens de clubes por delegado são
 * derivados das nomeações, por isso voltam todos a zero. Quem chama isto tem de
 * gravar uma cópia de segurança primeiro (ver `ipc`), porque não há maneira de
 * desfazer.
 */
export function apagarTodasNomeacoes(): number {
  const db = obterBaseDados()
  const antes = contarNomeacoes()
  db.prepare('DELETE FROM nomeacao').run()
  registarAuditoria('nomeacao', null, 'apagar-todas', { apagadas: antes })
  return antes
}

/**
 * Remove a nomeação de um papel num jogo. Nas sombras, que podem ser várias, é
 * preciso dizer qual: sem `delegadoId` saíam todas de uma vez.
 */
export function removerNomeacao(jogoId: number, papel: Nomeacao['papel'], delegadoId?: number): void {
  const db = obterBaseDados()
  if (delegadoId != null) {
    db.prepare(`DELETE FROM nomeacao WHERE jogo_id = ? AND papel = ? AND delegado_id = ?`).run(
      jogoId,
      papel,
      delegadoId
    )
  } else {
    db.prepare(`DELETE FROM nomeacao WHERE jogo_id = ? AND papel = ?`).run(jogoId, papel)
  }
  registarAuditoria('nomeacao', jogoId, 'remover', { papel, delegadoId: delegadoId ?? null })
}

// ---------------------------------------------------------------------------
// Estatísticas para o motor e para o dashboard
// ---------------------------------------------------------------------------

export interface EstatisticasDelegado {
  delegadoId: number
  km: number
  minutos: number
  jogos: number
  /** Deslocações que obrigaram a avião — custam à FPF muito mais do que os km. */
  voos: number
  clubes: Record<number, number>
  competicoes: Record<number, number>
  ultimaNomeacaoEm: string | null
  agenda: { jogoId: number; dataHora: string | null; descricao: string }[]
}

/** Agrega, por delegado, tudo o que o motor precisa de saber sobre a época. */
export function estatisticasPorDelegado(seasonId?: number): Map<number, EstatisticasDelegado> {
  const filtroEpoca = seasonId != null ? 'AND comp.season_id = @seasonId' : ''
  const linhas = obterBaseDados()
    .prepare(
      `SELECT n.delegado_id, n.km, n.minutos, n.fonte_distancia, j.id AS jogo_id, j.data_hora,
              j.clube_casa_id, j.clube_fora_id, j.competicao_id,
              cc.nome AS casa_nome, cf.nome AS fora_nome
       FROM nomeacao n
       JOIN jogo j ON j.id = n.jogo_id
       JOIN competicao comp ON comp.id = j.competicao_id
       JOIN clube cc ON cc.id = j.clube_casa_id
       JOIN clube cf ON cf.id = j.clube_fora_id
       -- As sombras vão ao jogo a aprender: não somam km, jogos, voos nem clubes.
       WHERE n.estado = 'CONFIRMADA' AND n.papel <> 'SOMBRA' ${filtroEpoca}`
    )
    .all(seasonId != null ? { seasonId } : {}) as {
    delegado_id: number
    km: number | null
    minutos: number | null
    fonte_distancia: string | null
    jogo_id: number
    data_hora: string | null
    clube_casa_id: number
    clube_fora_id: number
    competicao_id: number
    casa_nome: string
    fora_nome: string
  }[]

  const mapa = new Map<number, EstatisticasDelegado>()
  for (const l of linhas) {
    let e = mapa.get(l.delegado_id)
    if (!e) {
      e = {
        delegadoId: l.delegado_id,
        km: 0,
        minutos: 0,
        jogos: 0,
        voos: 0,
        clubes: {},
        competicoes: {},
        ultimaNomeacaoEm: null,
        agenda: []
      }
      mapa.set(l.delegado_id, e)
    }
    e.km += l.km ?? 0
    e.minutos += l.minutos ?? 0
    e.jogos += 1
    if (l.fonte_distancia === 'AVIAO') e.voos += 1
    e.clubes[l.clube_casa_id] = (e.clubes[l.clube_casa_id] ?? 0) + 1
    e.clubes[l.clube_fora_id] = (e.clubes[l.clube_fora_id] ?? 0) + 1
    e.competicoes[l.competicao_id] = (e.competicoes[l.competicao_id] ?? 0) + 1
    e.agenda.push({ jogoId: l.jogo_id, dataHora: l.data_hora, descricao: `${l.casa_nome} × ${l.fora_nome}` })
    if (l.data_hora && (!e.ultimaNomeacaoEm || l.data_hora > e.ultimaNomeacaoEm)) {
      e.ultimaNomeacaoEm = l.data_hora
    }
  }
  return mapa
}

/**
 * Quem aparece nas contas de uma época: os delegados do quadro, mais os que
 * entretanto foram arquivados mas fizeram jogos nessa época. Sem eles, os km
 * de uma época passada mudavam sozinhos quando alguém saísse do quadro.
 */
function delegadosDaEpoca(stats: Map<number, EstatisticasDelegado>): Delegado[] {
  const doQuadro = listarDelegados(false)
  const conhecidos = new Set(doQuadro.map((d) => d.id))
  const arquivados = [...stats.keys()]
    .filter((id) => !conhecidos.has(id))
    .map((id) => obterDelegado(id))
    .filter((d): d is Delegado => d !== null)
  return [...doQuadro, ...arquivados]
}

export function tabelaKm(seasonId?: number): LinhaKmDelegado[] {
  const stats = estatisticasPorDelegado(seasonId)
  const delegados = delegadosDaEpoca(stats)
  const kms = delegados.map((d) => stats.get(d.id)?.km ?? 0)
  const media = kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : 0
  return delegados
    .map((d) => {
      const e = stats.get(d.id)
      const km = e?.km ?? 0
      return {
        delegadoId: d.id,
        numero: d.numero,
        nome: d.nome,
        nivel: d.nivel,
        jogos: e?.jogos ?? 0,
        voos: e?.voos ?? 0,
        km: Math.round(km * 10) / 10,
        desvio: Math.round((km - media) * 10) / 10,
        minutos: Math.round(e?.minutos ?? 0)
      }
    })
    .sort((a, b) => a.km - b.km)
}

/**
 * Todos os jogos de um delegado numa época, com a viagem de cada um.
 *
 * É o que responde a "porque é que este delegado tem tantos km?" — a tabela do
 * dashboard dá o total, e o total sozinho não se explica. As sombras aparecem
 * na lista, marcadas: foram jogos a que o delegado foi, ainda que não contem.
 */
export function jogosDoDelegado(delegadoId: number, seasonId?: number): JogoDoDelegado[] {
  const filtroEpoca = seasonId != null ? 'AND comp.season_id = @seasonId' : ''
  const linhas = obterBaseDados()
    .prepare(
      `SELECT j.id AS jogo_id, j.data_hora, comp.season_id, comp.nome AS competicao_nome,
              cc.nome AS casa, cf.nome AS fora, r.nome AS recinto,
              n.papel, n.km, n.minutos, n.fonte_distancia
         FROM nomeacao n
         JOIN jogo j ON j.id = n.jogo_id
         JOIN competicao comp ON comp.id = j.competicao_id
         JOIN clube cc ON cc.id = j.clube_casa_id
         JOIN clube cf ON cf.id = j.clube_fora_id
         LEFT JOIN recinto r ON r.id = j.recinto_id
        WHERE n.delegado_id = @delegadoId AND n.estado = 'CONFIRMADA' ${filtroEpoca}
        ORDER BY j.data_hora DESC`
    )
    .all(seasonId != null ? { delegadoId, seasonId } : { delegadoId }) as {
    jogo_id: number
    data_hora: string | null
    season_id: number
    competicao_nome: string
    casa: string
    fora: string
    recinto: string | null
    papel: string
    km: number | null
    minutos: number | null
    fonte_distancia: string | null
  }[]

  return linhas.map((l) => ({
    jogoId: l.jogo_id,
    dataHora: l.data_hora,
    seasonId: l.season_id,
    competicaoNome: l.competicao_nome,
    clubeCasaNome: l.casa,
    clubeForaNome: l.fora,
    recintoNome: l.recinto,
    papel: l.papel as JogoDoDelegado['papel'],
    km: l.km,
    minutos: l.minutos,
    fonteDistancia: l.fonte_distancia as JogoDoDelegado['fonteDistancia']
  }))
}

export interface FiltroNomeacoes {
  /** Data e hora do jogo a partir da qual se quer a lista (ISO local). */
  de?: string
  ate?: string
  /** Só delegados deste nível; sem isto, todos. */
  nivel?: NivelDelegado
}

/**
 * As nomeações em lista, para saírem da aplicação.
 *
 * Ordena pela data do jogo, da mais próxima para a mais distante: quem exporta
 * está a preparar o que aí vem, não a rever o que já foi. A procura por texto
 * fica no ecrã, que a faz sem acentos.
 */
export function listarNomeacoes(filtro: FiltroNomeacoes = {}): NomeacaoExportada[] {
  const condicoes = ["n.estado = 'CONFIRMADA'"]
  const params: Record<string, unknown> = {}
  if (filtro.de) {
    condicoes.push('j.data_hora >= @de')
    params.de = filtro.de
  }
  if (filtro.ate) {
    condicoes.push('j.data_hora <= @ate')
    params.ate = filtro.ate
  }
  if (filtro.nivel) {
    condicoes.push('d.nivel = @nivel')
    params.nivel = filtro.nivel
  }

  const linhas = obterBaseDados()
    .prepare(
      `SELECT j.id AS jogo_id, j.data_hora, comp.nome AS competicao_nome,
              cc.nome AS casa, cf.nome AS fora, r.nome AS recinto,
              d.id AS delegado_id, d.numero, d.nome AS delegado_nome, d.nivel,
              n.papel, n.km, n.minutos
         FROM nomeacao n
         JOIN jogo j ON j.id = n.jogo_id
         JOIN competicao comp ON comp.id = j.competicao_id
         JOIN clube cc ON cc.id = j.clube_casa_id
         JOIN clube cf ON cf.id = j.clube_fora_id
         JOIN delegado d ON d.id = n.delegado_id
         LEFT JOIN recinto r ON r.id = j.recinto_id
        WHERE ${condicoes.join(' AND ')}
        ORDER BY j.data_hora, comp.nome, cc.nome`
    )
    .all(params) as {
    jogo_id: number
    data_hora: string | null
    competicao_nome: string
    casa: string
    fora: string
    recinto: string | null
    delegado_id: number
    numero: string
    delegado_nome: string
    nivel: string
    papel: string
    km: number | null
    minutos: number | null
  }[]

  return linhas.map((l) => ({
    jogoId: l.jogo_id,
    dataHora: l.data_hora,
    competicaoNome: l.competicao_nome,
    clubeCasaNome: l.casa,
    clubeForaNome: l.fora,
    recintoNome: l.recinto,
    delegadoId: l.delegado_id,
    delegadoNumero: l.numero,
    delegadoNome: l.delegado_nome,
    delegadoNivel: l.nivel as NomeacaoExportada['delegadoNivel'],
    papel: l.papel as NomeacaoExportada['papel'],
    km: l.km,
    minutos: l.minutos
  }))
}

export function matrizPorCompeticao(seasonId?: number): MatrizDashboard {
  // Primeiro as competições em que todos os jogos levam delegado: são o
  // trabalho de todas as semanas, e é aí que o coordenador olha. As outras —
  // Taça e afins, com jogos escolhidos à mão — ficam para o fim.
  const competicoes = listarCompeticoes(seasonId)
    .filter((c) => c.ativa)
    .sort(
      (a, b) =>
        Number(b.todosComDelegado) - Number(a.todosComDelegado) || a.nome.localeCompare(b.nome, 'pt')
    )
  const stats = estatisticasPorDelegado(seasonId)
  const delegados = delegadosDaEpoca(stats)
  return {
    colunas: competicoes.map((c) => ({ chave: String(c.id), etiqueta: c.nome })),
    linhas: delegados.map((d) => ({ delegadoId: d.id, numero: d.numero, nome: d.nome })),
    celulas: delegados.flatMap((d) =>
      competicoes.map((c) => ({
        delegadoId: d.id,
        chaveColuna: String(c.id),
        valor: stats.get(d.id)?.competicoes[c.id] ?? 0
      }))
    )
  }
}

/**
 * Clubes repetidos por delegado, contados pelo par clube/competição.
 *
 * Uma tabela com uma coluna por clube tornava-se ilegível a meio da época (são
 * mais de cem clubes nas competições nacionais) e mostrava sobretudo células
 * vazias. O que interessa ao coordenador é o contrário: quem repetiu, o quê, e
 * quantas vezes. Repetir o mesmo clube em competições diferentes não conta —
 * são equipas e escalões diferentes.
 */
export function repeticoesPorDelegado(seasonId?: number): LinhaRepeticoes[] {
  const filtroEpoca = seasonId != null ? 'AND comp.season_id = @seasonId' : ''
  const linhas = obterBaseDados()
    .prepare(
      `SELECT n.delegado_id, j.competicao_id, comp.nome AS competicao_nome,
              c.id AS clube_id, c.nome AS clube_nome, COUNT(*) AS vezes
         FROM nomeacao n
         JOIN jogo j ON j.id = n.jogo_id
         JOIN competicao comp ON comp.id = j.competicao_id
         -- Cada jogo conta para os dois clubes: o delegado esteve com ambos.
         JOIN clube c ON c.id IN (j.clube_casa_id, j.clube_fora_id)
        -- Uma sombra não fez o clube: acompanhou quem o fez.
        WHERE n.estado = 'CONFIRMADA' AND n.papel <> 'SOMBRA' ${filtroEpoca}
        GROUP BY n.delegado_id, j.competicao_id, c.id
       HAVING COUNT(*) > 1
        ORDER BY vezes DESC, c.nome`
    )
    .all(seasonId != null ? { seasonId } : {}) as {
    delegado_id: number
    competicao_id: number
    competicao_nome: string
    clube_id: number
    clube_nome: string
    vezes: number
  }[]

  const porDelegado = new Map<number, RepeticaoClube[]>()
  for (const l of linhas) {
    const lista = porDelegado.get(l.delegado_id) ?? []
    lista.push({
      clubeId: l.clube_id,
      clubeNome: l.clube_nome,
      competicaoId: l.competicao_id,
      competicaoNome: l.competicao_nome,
      vezes: l.vezes
    })
    porDelegado.set(l.delegado_id, lista)
  }

  // Todos os delegados ativos aparecem, mesmo sem repetições: a ausência é
  // informação — é quem ainda está a rodar bem.
  return delegadosDaEpoca(estatisticasPorDelegado(seasonId)).map((d) => ({
    delegadoId: d.id,
    numero: d.numero,
    nome: d.nome,
    repeticoes: porDelegado.get(d.id) ?? []
  }))
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

type LinhaAlerta = {
  id: number
  chave: string
  tipo: string
  jogo_id: number | null
  recinto_id: number | null
  competicao: string | null
  descricao: string
  data_hora: string | null
  detalhe: string
  lido: number
  criado_em: string
}

const paraAlerta = (l: LinhaAlerta): Alerta => ({
  id: l.id,
  chave: l.chave,
  tipo: l.tipo as Alerta['tipo'],
  jogoId: l.jogo_id,
  recintoId: l.recinto_id,
  competicao: l.competicao,
  descricao: l.descricao,
  dataHora: l.data_hora,
  detalhe: l.detalhe,
  lido: bool(l.lido),
  criadoEm: l.criado_em
})

export type EntradaAlerta = Omit<Alerta, 'id' | 'lido' | 'criadoEm' | 'recintoId'> & {
  recintoId?: number | null
}

/**
 * Grava alertas ignorando os que já existem: a atualização corre de hora a hora
 * e o mesmo adiamento não deve encher a lista de repetições.
 */
/**
 * Grava alertas novos.
 *
 * Dois filtros antes de gravar seja o que for: nada se avisa sobre um jogo cuja
 * hora já passou, e nada se repete — nem que o alerta anterior tenha sido
 * apagado. Um alerta apagado é um alerta tratado, e vê-lo voltar sozinho na
 * atualização seguinte fazia a lista parecer avariada.
 */
export function criarAlertas(entradas: EntradaAlerta[]): Alerta[] {
  if (!entradas.length) return []
  const db = obterBaseDados()
  const jaVistos = new Set(
    (db.prepare('SELECT chave FROM alerta_visto').all() as { chave: string }[]).map((l) => l.chave)
  )
  entradas = entradas.filter((e) => vaiAcontecer(e.dataHora) && !jaVistos.has(e.chave))
  if (!entradas.length) return []
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO alerta
       (chave, tipo, jogo_id, recinto_id, competicao, descricao, data_hora, detalhe, lido, criado_em)
     VALUES (@chave, @tipo, @jogoId, @recintoId, @competicao, @descricao, @dataHora, @detalhe, 0, @criadoEm)`
  )
  const marcarVisto = db.prepare('INSERT OR IGNORE INTO alerta_visto (chave, criado_em) VALUES (?, ?)')
  const criadas: string[] = []
  const transacao = db.transaction(() => {
    for (const e of entradas) {
      const info = inserir.run({ recintoId: null, ...e, criadoEm: agora() })
      // A chave fica registada mesmo assim: é isso que impede o alerta de
      // voltar depois de o coordenador o apagar.
      marcarVisto.run(e.chave, agora())
      if (info.changes > 0) criadas.push(e.chave)
    }
  })
  transacao()
  if (!criadas.length) return []
  const marcadores = criadas.map(() => '?').join(',')
  return (
    db.prepare(`SELECT * FROM alerta WHERE chave IN (${marcadores}) ORDER BY criado_em DESC`).all(...criadas) as LinhaAlerta[]
  ).map(paraAlerta)
}

/**
 * Os recintos em certo estado que têm jogos marcados, com o próximo desses
 * jogos. É a parte comum aos dois alertas de recinto: o que interessa não é o
 * recinto em si, é haver trabalho marcado para lá.
 */
function recintosComJogoMarcado(
  condicao: string,
  desde: string
): {
  recinto_id: number
  recinto_nome: string
  jogo_id: number
  data_hora: string | null
  casa: string
  fora: string
  competicao: string
  jogos: number
}[] {
  const RELEVANTE = `j.recinto_id = r.id AND j.data_hora >= @desde AND j.escondido = 0
    AND COALESCE(j.leva_delegado, c.todos_com_delegado) = 1`
  return obterBaseDados()
    .prepare(
      `SELECT r.id AS recinto_id, r.nome AS recinto_nome,
              pj.id AS jogo_id, pj.data_hora, cc.nome AS casa, cf.nome AS fora, pc.nome AS competicao,
              (SELECT COUNT(*) FROM jogo j JOIN competicao c ON c.id = j.competicao_id
                WHERE ${RELEVANTE}) AS jogos
         FROM recinto r
         JOIN jogo pj ON pj.id = (
           SELECT j.id FROM jogo j JOIN competicao c ON c.id = j.competicao_id
            WHERE ${RELEVANTE}
            ORDER BY j.data_hora LIMIT 1)
         JOIN clube cc ON cc.id = pj.clube_casa_id
         JOIN clube cf ON cf.id = pj.clube_fora_id
         JOIN competicao pc ON pc.id = pj.competicao_id
        WHERE ${condicao}
        ORDER BY pj.data_hora`
    )
    .all({ desde }) as ReturnType<typeof recintosComJogoMarcado>
}

/** "e mais N jogos", quando o recinto tem mais do que um jogo marcado. */
const maisJogos = (jogos: number): string =>
  jogos > 1 ? ` (tal como mais ${jogos - 1} ${jogos - 1 === 1 ? 'jogo' : 'jogos'})` : ''

/**
 * Alertas dos recintos sem coordenadas que têm um jogo marcado.
 *
 * Os recintos só interessam por causa dos km: sem coordenadas, os jogos que lá
 * se realizam ficam sem distâncias e os candidatos não podem ser ordenados.
 * Por isso o alerta nasce do jogo, não do recinto — um recinto sem coordenadas
 * onde ninguém vai jogar não é trabalho para ninguém.
 *
 * Contam os jogos por realizar que levam delegado. A chave inclui o próximo
 * desses jogos: se o coordenador apagar o alerta sem pôr coordenadas, o
 * próximo jogo marcado para lá volta a avisar.
 */
export function alertasDeRecintosSemCoordenadas(desde = limiteDeTrabalho()): EntradaAlerta[] {
  return recintosComJogoMarcado('r.lat IS NULL OR r.lng IS NULL', desde).map((l) => ({
    chave: `recinto-sem-coords:${l.recinto_id}:${l.jogo_id}`,
    tipo: 'RECINTO_SEM_COORDENADAS' as const,
    jogoId: l.jogo_id,
    recintoId: l.recinto_id,
    competicao: l.competicao,
    descricao: l.recinto_nome,
    dataHora: l.data_hora,
    detalhe:
      `${l.casa} × ${l.fora} está marcado para este recinto, que não tem coordenadas` +
      maisJogos(l.jogos) +
      '. Sem elas não há km nem distâncias para ordenar os candidatos. Abra "Clubes e recintos" ' +
      'e defina a localização — pode colar um link do Google Maps.'
  }))
}

/**
 * Alertas dos recintos que a pesquisa localizou sozinha e ninguém confirmou.
 *
 * Um ponto automático pode cair a dezenas de quilómetros do sítio certo — outra
 * terra com o mesmo nome, um campo que o mapa não conhece — e a partir daí as
 * distâncias desse recinto ficam erradas em silêncio, que é pior do que não as
 * ter. O ecrã de recintos já os contava, mas só dava por isso quem lá fosse.
 */
export function alertasDeRecintosPorConfirmar(desde = limiteDeTrabalho()): EntradaAlerta[] {
  return recintosComJogoMarcado(
    'r.lat IS NOT NULL AND r.lng IS NOT NULL AND r.confirmado = 0',
    desde
  ).map((l) => ({
    chave: `recinto-por-confirmar:${l.recinto_id}:${l.jogo_id}`,
    tipo: 'RECINTO_POR_CONFIRMAR' as const,
    jogoId: l.jogo_id,
    recintoId: l.recinto_id,
    competicao: l.competicao,
    descricao: l.recinto_nome,
    dataHora: l.data_hora,
    detalhe:
      `${l.casa} × ${l.fora} está marcado para este recinto` +
      maisJogos(l.jogos) +
      ', e a localização dele foi obtida por pesquisa automática. Confirme o ponto no mapa em ' +
      '"Clubes e recintos": se estiver no sítio errado, os km deste recinto saem todos errados.'
  }))
}

/** Fecha os alertas dos recintos que entretanto ficaram com coordenadas. */
export function apagarAlertasDeRecintosLocalizados(): number {
  const info = obterBaseDados()
    .prepare(
      `DELETE FROM alerta
        WHERE tipo = 'RECINTO_SEM_COORDENADAS'
          AND recinto_id IN (SELECT id FROM recinto WHERE lat IS NOT NULL AND lng IS NOT NULL)`
    )
    .run()
  return info.changes
}

/** Fecha os alertas dos recintos cujo ponto já foi confirmado. */
export function apagarAlertasDeRecintosConfirmados(): number {
  const info = obterBaseDados()
    .prepare(
      `DELETE FROM alerta
        WHERE tipo = 'RECINTO_POR_CONFIRMAR'
          AND recinto_id IN (
            SELECT id FROM recinto WHERE confirmado = 1 OR lat IS NULL OR lng IS NULL)`
    )
    .run()
  return info.changes
}

export function listarAlertas(apenasPorLer = false): Alerta[] {
  const sql = `SELECT * FROM alerta ${apenasPorLer ? 'WHERE lido = 0' : ''} ORDER BY lido, criado_em DESC LIMIT 200`
  return (obterBaseDados().prepare(sql).all() as LinhaAlerta[]).map(paraAlerta)
}

export function marcarAlertaLido(id: number, lido: boolean): void {
  obterBaseDados().prepare('UPDATE alerta SET lido = ? WHERE id = ?').run(lido ? 1 : 0, id)
}

export function marcarTodosAlertasLidos(): void {
  obterBaseDados().prepare('UPDATE alerta SET lido = 1 WHERE lido = 0').run()
}

export function apagarAlerta(id: number): void {
  obterBaseDados().prepare('DELETE FROM alerta WHERE id = ?').run(id)
}

/** Jogos futuros de uma competição, para detetar os que deixaram de existir. */
export function jogosFuturosDaCompeticao(competicaoId: number, desde: string): JogoDetalhado[] {
  return listarJogos({ competicaoId, de: desde })
}

/**
 * Outros jogos do delegado que caem na folga à volta de um jogo.
 * É o que responde a "este jogo foi adiado — o delegado já tem outro nessa data?".
 */
export function jogosDoDelegadoPerto(
  delegadoId: number,
  dataHora: string,
  folga: Folga,
  excluirJogoId: number
): JogoDetalhado[] {
  const agenda = obterBaseDados()
    .prepare(
      `SELECT j.id, j.data_hora FROM nomeacao n JOIN jogo j ON j.id = n.jogo_id
       WHERE n.delegado_id = ? AND n.estado <> 'CANCELADA' AND j.data_hora IS NOT NULL`
    )
    .all(delegadoId) as { id: number; data_hora: string }[]

  return jogosQueColidem(
    agenda.map((l) => ({ id: l.id, dataHora: l.data_hora, descricao: '' })),
    dataHora,
    folga,
    excluirJogoId
  )
    .map((j) => obterJogoDetalhado(j.id))
    .filter((j): j is JogoDetalhado => j !== null)
}
