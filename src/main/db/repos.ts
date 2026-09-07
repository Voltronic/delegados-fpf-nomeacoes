import type {
  Clube,
  Competicao,
  Delegado,
  EstadoJogo,
  Indisponibilidade,
  Jogo,
  JogoDetalhado,
  LinhaKmDelegado,
  MatrizDashboard,
  Nomeacao,
  NomeacaoDetalhada,
  Recinto,
  VetoClube
} from '@shared/tipos'
import { obterBaseDados, registarAuditoria } from './index'
import { normalizarNome } from '../fpf/html'

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
  coordsManuais: bool(l.coords_manuais)
})

export function listarDelegados(incluirInativos = true): Delegado[] {
  const sql = `SELECT * FROM delegado ${incluirInativos ? '' : 'WHERE ativo = 1'} ORDER BY nome`
  return (obterBaseDados().prepare(sql).all() as LinhaDelegado[]).map(paraDelegado)
}

export function obterDelegado(id: number): Delegado | null {
  const linha = obterBaseDados().prepare('SELECT * FROM delegado WHERE id = ?').get(id) as
    | LinhaDelegado
    | undefined
  return linha ? paraDelegado(linha) : null
}

export type EntradaDelegado = Omit<Delegado, 'id'>

export function criarDelegado(dados: EntradaDelegado): Delegado {
  const info = obterBaseDados()
    .prepare(
      `INSERT INTO delegado (numero, nome, morada, lat, lng, nivel, telefone, email, ativo, notas, coords_manuais)
       VALUES (@numero, @nome, @morada, @lat, @lng, @nivel, @telefone, @email, @ativo, @notas, @coordsManuais)`
    )
    .run({ ...dados, ativo: dados.ativo ? 1 : 0, coordsManuais: dados.coordsManuais ? 1 : 0 })
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
    .run({ ...dados, id, ativo: dados.ativo ? 1 : 0, coordsManuais: dados.coordsManuais ? 1 : 0 })
  registarAuditoria('delegado', id, 'atualizar', dados)
  return obterDelegado(id)!
}

export function apagarDelegado(id: number): void {
  obterBaseDados().prepare('DELETE FROM delegado WHERE id = ?').run(id)
  registarAuditoria('delegado', id, 'apagar')
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
}): Recinto => ({
  id: l.id,
  nome: l.nome,
  morada: l.morada,
  lat: l.lat,
  lng: l.lng,
  coordsManuais: bool(l.coords_manuais),
  geocodificadoEm: l.geocodificado_em
})

export function listarRecintos(): Recinto[] {
  return (
    obterBaseDados().prepare('SELECT * FROM recinto ORDER BY nome').all() as Parameters<typeof paraRecinto>[0][]
  ).map(paraRecinto)
}

export function obterRecinto(id: number): Recinto | null {
  const l = obterBaseDados().prepare('SELECT * FROM recinto WHERE id = ?').get(id) as
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
        coords_manuais = ?, geocodificado_em = ? WHERE id = ?`
    )
    .run(
      dados.nome,
      normalizarNome(dados.nome),
      dados.morada,
      dados.lat,
      dados.lng,
      dados.coordsManuais ? 1 : 0,
      dados.lat != null ? agora() : null,
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

// ---------------------------------------------------------------------------
// Competições
// ---------------------------------------------------------------------------

const paraCompeticao = (l: {
  id: number
  fpf_competition_id: number | null
  season_id: number
  nome: string
  organizacao: string | null
  ativa: number
  nivel_minimo: string | null
  usa_delegado_campo: number
}): Competicao => ({
  id: l.id,
  fpfCompetitionId: l.fpf_competition_id,
  seasonId: l.season_id,
  nome: l.nome,
  organizacao: l.organizacao,
  ativa: bool(l.ativa),
  nivelMinimo: l.nivel_minimo as Competicao['nivelMinimo'],
  usaDelegadoCampo: bool(l.usa_delegado_campo)
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
    nome: dados.nome,
    organizacao: dados.organizacao,
    ativa: dados.ativa ? 1 : 0,
    nivelMinimo: dados.nivelMinimo,
    usaDelegadoCampo: dados.usaDelegadoCampo ? 1 : 0
  }
  if (dados.id) {
    db.prepare(
      `UPDATE competicao SET fpf_competition_id=@fpfCompetitionId, season_id=@seasonId, nome=@nome,
        organizacao=@organizacao, ativa=@ativa, nivel_minimo=@nivelMinimo,
        usa_delegado_campo=@usaDelegadoCampo WHERE id=@id`
    ).run({ ...params, id: dados.id })
    return listarCompeticoes().find((c) => c.id === dados.id)!
  }
  const info = db
    .prepare(
      `INSERT INTO competicao (fpf_competition_id, season_id, nome, organizacao, ativa, nivel_minimo, usa_delegado_campo)
       VALUES (@fpfCompetitionId, @seasonId, @nome, @organizacao, @ativa, @nivelMinimo, @usaDelegadoCampo)
       ON CONFLICT(fpf_competition_id, season_id) DO UPDATE SET
         nome = excluded.nome, organizacao = excluded.organizacao, ativa = excluded.ativa`
    )
    .run(params)
  const id =
    Number(info.lastInsertRowid) ||
    (
      db
        .prepare('SELECT id FROM competicao WHERE fpf_competition_id = ? AND season_id = ?')
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
  alteradoEm: l.alterado_em
})

export interface FiltroJogos {
  de?: string
  ate?: string
  competicaoId?: number
  /** 'TODOS' | 'POR_NOMEAR' | 'PARCIAL' | 'COMPLETO' */
  estadoNomeacao?: string
  texto?: string
}

const SQL_JOGO_DETALHADO = `
  SELECT j.*, comp.nome AS competicao_nome, comp.usa_delegado_campo,
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
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
  const linhas = obterBaseDados()
    .prepare(`${SQL_JOGO_DETALHADO} ${where} ORDER BY j.data_hora, comp.nome`)
    .all(params) as (LinhaJogo & {
    competicao_nome: string
    usa_delegado_campo: number
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

export function obterJogoDetalhado(id: number): JogoDetalhado | null {
  const linhas = listarJogos()
  return linhas.find((j) => j.id === id) ?? null
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

export function guardarJogo(dados: EntradaJogo): number {
  const db = obterBaseDados()
  const existente = obterJogoPorChave(dados.chaveNatural)
  if (existente) {
    db.prepare(
      `UPDATE jogo SET fase=@fase, serie=@serie, jornada=@jornada, fpf_fixture_id=@fpfFixtureId,
        fpf_match_id=@fpfMatchId, data_hora=@dataHora, recinto_id=@recintoId,
        recinto_texto_fpf=@recintoTextoFpf, estado=@estado, alterado_em=@alteradoEm
       WHERE id=@id`
    ).run({ ...dados, id: existente.id, alteradoEm: agora() })
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
  return Number(info.lastInsertRowid)
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
       ORDER BY n.papel DESC`
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
         WHERE n.jogo_id = ? AND n.estado <> 'CANCELADA' ORDER BY n.papel DESC`
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
    // Substitui a nomeação existente para o mesmo papel.
    db.prepare(`DELETE FROM nomeacao WHERE jogo_id = ? AND papel = ? AND estado <> 'CANCELADA'`).run(
      dados.jogoId,
      dados.papel
    )
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

export function removerNomeacao(jogoId: number, papel: Nomeacao['papel']): void {
  obterBaseDados()
    .prepare(`DELETE FROM nomeacao WHERE jogo_id = ? AND papel = ?`)
    .run(jogoId, papel)
  registarAuditoria('nomeacao', jogoId, 'remover', { papel })
}

// ---------------------------------------------------------------------------
// Estatísticas para o motor e para o dashboard
// ---------------------------------------------------------------------------

export interface EstatisticasDelegado {
  delegadoId: number
  km: number
  minutos: number
  jogos: number
  clubes: Record<number, number>
  competicoes: Record<number, number>
  ultimaNomeacaoEm: string | null
  agenda: { jogoId: number; dataHora: string | null }[]
}

/** Agrega, por delegado, tudo o que o motor precisa de saber sobre a época. */
export function estatisticasPorDelegado(seasonId?: number): Map<number, EstatisticasDelegado> {
  const filtroEpoca = seasonId != null ? 'AND comp.season_id = @seasonId' : ''
  const linhas = obterBaseDados()
    .prepare(
      `SELECT n.delegado_id, n.km, n.minutos, j.id AS jogo_id, j.data_hora,
              j.clube_casa_id, j.clube_fora_id, j.competicao_id
       FROM nomeacao n
       JOIN jogo j ON j.id = n.jogo_id
       JOIN competicao comp ON comp.id = j.competicao_id
       WHERE n.estado = 'CONFIRMADA' ${filtroEpoca}`
    )
    .all(seasonId != null ? { seasonId } : {}) as {
    delegado_id: number
    km: number | null
    minutos: number | null
    jogo_id: number
    data_hora: string | null
    clube_casa_id: number
    clube_fora_id: number
    competicao_id: number
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
    e.clubes[l.clube_casa_id] = (e.clubes[l.clube_casa_id] ?? 0) + 1
    e.clubes[l.clube_fora_id] = (e.clubes[l.clube_fora_id] ?? 0) + 1
    e.competicoes[l.competicao_id] = (e.competicoes[l.competicao_id] ?? 0) + 1
    e.agenda.push({ jogoId: l.jogo_id, dataHora: l.data_hora })
    if (l.data_hora && (!e.ultimaNomeacaoEm || l.data_hora > e.ultimaNomeacaoEm)) {
      e.ultimaNomeacaoEm = l.data_hora
    }
  }
  return mapa
}

export function tabelaKm(seasonId?: number): LinhaKmDelegado[] {
  const delegados = listarDelegados(false)
  const stats = estatisticasPorDelegado(seasonId)
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
        km: Math.round(km * 10) / 10,
        desvio: Math.round((km - media) * 10) / 10,
        minutos: Math.round(e?.minutos ?? 0)
      }
    })
    .sort((a, b) => a.km - b.km)
}

export function matrizPorCompeticao(seasonId?: number): MatrizDashboard {
  const delegados = listarDelegados(false)
  const competicoes = listarCompeticoes(seasonId).filter((c) => c.ativa)
  const stats = estatisticasPorDelegado(seasonId)
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

export function matrizPorClube(seasonId?: number): MatrizDashboard {
  const delegados = listarDelegados(false)
  const stats = estatisticasPorDelegado(seasonId)
  const clubesUsados = new Set<number>()
  for (const e of stats.values()) for (const id of Object.keys(e.clubes)) clubesUsados.add(Number(id))
  const clubes = listarClubes().filter((c) => clubesUsados.has(c.id))
  return {
    colunas: clubes.map((c) => ({ chave: String(c.id), etiqueta: c.nome })),
    linhas: delegados.map((d) => ({ delegadoId: d.id, numero: d.numero, nome: d.nome })),
    celulas: delegados.flatMap((d) =>
      clubes.map((c) => ({
        delegadoId: d.id,
        chaveColuna: String(c.id),
        valor: stats.get(d.id)?.clubes[c.id] ?? 0
      }))
    )
  }
}
