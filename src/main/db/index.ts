import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { MIGRACOES } from './schema'
import { PESOS_POR_OMISSAO } from '../engine/pesos'

let db: Database.Database | null = null

/**
 * A base de dados vive numa pasta `data/` ao lado do executável, para que toda a
 * aplicação seja copiável como uma pasta única (pen, OneDrive, outro PC).
 */
export function caminhoBaseDados(raizPortatil: string): string {
  return join(raizPortatil, 'data', 'delegados.db')
}

export function abrirBaseDados(caminho: string): Database.Database {
  mkdirSync(dirname(caminho), { recursive: true })
  const existia = existsSync(caminho)
  if (existia) copiaSeguranca(caminho)

  const conn = new Database(caminho)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  aplicarMigracoes(conn)
  semearConfiguracao(conn)
  db = conn
  return conn
}

/** Guarda uma cópia da BD antes de cada arranque (mantém a última). */
function copiaSeguranca(caminho: string): void {
  try {
    copyFileSync(caminho, `${caminho}.bak`)
  } catch (erro) {
    console.warn('Não foi possível criar cópia de segurança da base de dados:', erro)
  }
}

function aplicarMigracoes(conn: Database.Database): void {
  conn.exec('CREATE TABLE IF NOT EXISTS schema_versao (versao INTEGER PRIMARY KEY, aplicada_em TEXT NOT NULL)')
  const aplicadas = new Set(
    conn.prepare('SELECT versao FROM schema_versao').all().map((l) => (l as { versao: number }).versao)
  )
  for (const migracao of MIGRACOES) {
    if (aplicadas.has(migracao.versao)) continue
    const correr = conn.transaction(() => {
      conn.exec(migracao.sql)
      conn
        .prepare('INSERT INTO schema_versao (versao, aplicada_em) VALUES (?, ?)')
        .run(migracao.versao, new Date().toISOString())
    })
    correr()
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
  'mapa.tilesUrl': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
}

function semearConfiguracao(conn: Database.Database): void {
  const inserir = conn.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)')
  const correr = conn.transaction(() => {
    for (const [chave, valor] of Object.entries(CONFIG_POR_OMISSAO)) inserir.run(chave, valor)
  })
  correr()
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

export function registarAuditoria(entidade: string, entidadeId: number | null, accao: string, payload?: unknown): void {
  obterBaseDados()
    .prepare('INSERT INTO audit_log (entidade, entidade_id, accao, payload, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run(entidade, entidadeId, accao, payload === undefined ? null : JSON.stringify(payload), new Date().toISOString())
}
