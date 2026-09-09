import type {
  Alerta,
  Clube,
  Competicao,
  Delegado,
  EdicaoJogo,
  EstadoJogo,
  Indisponibilidade,
  Jogo,
  JogoDetalhado,
  LinhaKmDelegado,
  MatrizDashboard,
  LinhaRepeticoes,
  Nomeacao,
  NomeacaoDetalhada,
  Recinto,
  RepeticaoClube,
  VetoClube
} from '@shared/tipos'
import { obterBaseDados, registarAuditoria } from './index'
import { normalizarNome } from '../fpf/html'
import { jogosQueColidem } from '../sync/conflitos'

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
  // Por número, e numericamente: com ordenação de texto o 1084 vinha antes do
  // 109. O `CAST` dá 0 a números não numéricos, que ficam no início ordenados
  // pelo próprio texto.
  const sql = `
    SELECT * FROM delegado ${incluirInativos ? '' : 'WHERE ativo = 1'}
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
  season_descricao: string | null
  nome: string
  organizacao: string | null
  ativa: number
  nivel_minimo: string | null
  usa_delegado_campo: number
}): Competicao => ({
  id: l.id,
  fpfCompetitionId: l.fpf_competition_id,
  seasonId: l.season_id,
  seasonDescricao: l.season_descricao,
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
    seasonDescricao: dados.seasonDescricao,
    nome: dados.nome,
    organizacao: dados.organizacao,
    ativa: dados.ativa ? 1 : 0,
    nivelMinimo: dados.nivelMinimo,
    usaDelegadoCampo: dados.usaDelegadoCampo ? 1 : 0
  }
  if (dados.id) {
    db.prepare(
      `UPDATE competicao SET fpf_competition_id=@fpfCompetitionId, season_id=@seasonId,
        season_descricao=@seasonDescricao, nome=@nome, organizacao=@organizacao, ativa=@ativa,
        nivel_minimo=@nivelMinimo, usa_delegado_campo=@usaDelegadoCampo WHERE id=@id`
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
         ativa, nivel_minimo, usa_delegado_campo)
       VALUES (@fpfCompetitionId, @seasonId, @seasonDescricao, @nome, @organizacao, @ativa,
         @nivelMinimo, @usaDelegadoCampo)
       ON CONFLICT(fpf_competition_id, season_id) DO UPDATE SET
         nome = excluded.nome, organizacao = excluded.organizacao, ativa = excluded.ativa,
         season_descricao = COALESCE(excluded.season_descricao, competicao.season_descricao)
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
  editadoManualmente: !!l.editado_manualmente,
  editadoEm: l.editado_em,
  ultimaAlteracao: l.ultima_alteracao
})

export interface FiltroJogos {
  /** `true` devolve **apenas** os escondidos; por omissão são omitidos. */
  escondidos?: boolean
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
  // Os escondidos ficam de fora de tudo menos de quem os peça de propósito.
  condicoes.push(filtro.escondidos ? 'j.escondido = 1' : 'j.escondido = 0')
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

/**
 * Esconder é reversível e não apaga nada: o jogo sai das listas de trabalho e
 * fica no ecrã Escondidos até a data passar. Nomeações que existam ficam como
 * estão — se o jogo voltar, volta como estava.
 */
export function esconderJogo(id: number, escondido: boolean): void {
  obterBaseDados()
    .prepare('UPDATE jogo SET escondido = ?, escondido_em = ? WHERE id = ?')
    .run(escondido ? 1 : 0, escondido ? agora() : null, id)
  registarAuditoria('jogo', id, escondido ? 'esconder' : 'repor')
}

/**
 * A fronteira entre o que está por fazer e o que já ficou para trás é o início
 * do dia de hoje, não o instante atual: um jogo das 15h não pode sair da lista
 * de trabalho às 15h01, com o coordenador ainda a tratar dele. Só no dia
 * seguinte é que passa a histórico.
 */
export function inicioDeHoje(referencia = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${referencia.getFullYear()}-${p(referencia.getMonth() + 1)}-${p(referencia.getDate())}T00:00`
}

/**
 * Jogos escondidos que ainda estão para acontecer. Os que já passaram deixam de
 * aparecer — foram escondidos por não interessarem, e depois da data deixam de
 * poder interessar de todo.
 */
export function jogosEscondidos(desde = inicioDeHoje()): JogoDetalhado[] {
  return listarJogos({ escondidos: true, de: desde })
}

/**
 * Histórico: jogos que já se realizaram e tiveram delegado nomeado. É o registo
 * da época — o que ficou para trás sem nomeação não conta para nada e por isso
 * não aparece aqui.
 */
export function historicoJogos(filtro: FiltroJogos = {}): JogoDetalhado[] {
  const ate = filtro.ate ?? inicioDeHoje()
  return listarJogos({ ...filtro, ate })
    .filter((j) => j.nomeacoes.length > 0)
    .reverse()
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

    const alteracao = descreverAlteracao(existente, dados)
    db.prepare(
      `UPDATE jogo SET fase=@fase, serie=@serie, jornada=@jornada, fpf_fixture_id=@fpfFixtureId,
        fpf_match_id=@fpfMatchId, data_hora=@dataHora, recinto_id=@recintoId,
        recinto_texto_fpf=@recintoTextoFpf, estado=@estado, alterado_em=@alteradoEm,
        ultima_alteracao=COALESCE(@alteracao, ultima_alteracao)
       WHERE id=@id`
    ).run({ ...dados, id: existente.id, alteradoEm: agora(), alteracao })
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
        WHERE n.estado = 'CONFIRMADA' ${filtroEpoca}
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
  return listarDelegados(false).map((d) => ({
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
export function criarAlertas(entradas: EntradaAlerta[]): Alerta[] {
  if (!entradas.length) return []
  const db = obterBaseDados()
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO alerta
       (chave, tipo, jogo_id, recinto_id, competicao, descricao, data_hora, detalhe, lido, criado_em)
     VALUES (@chave, @tipo, @jogoId, @recintoId, @competicao, @descricao, @dataHora, @detalhe, 0, @criadoEm)`
  )
  const criadas: string[] = []
  const transacao = db.transaction(() => {
    for (const e of entradas) {
      const info = inserir.run({ recintoId: null, ...e, criadoEm: agora() })
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
 * Alertas dos recintos que continuam sem ponto no mapa. Sem coordenadas não há
 * distâncias, e sem distâncias o motor não consegue ordenar candidatos para
 * esses jogos — por isso isto tem de saltar à vista em vez de falhar calado.
 */
export function alertasDeRecintosSemCoordenadas(): EntradaAlerta[] {
  return recintosSemCoordenadas().map((r) => ({
    chave: `recinto-sem-coords:${r.id}`,
    tipo: 'RECINTO_SEM_COORDENADAS' as const,
    jogoId: null,
    recintoId: r.id,
    competicao: null,
    descricao: r.nome,
    dataHora: null,
    detalhe:
      'Este recinto ficou sem coordenadas, por isso os jogos que lá se realizam não têm distâncias ' +
      'e os candidatos não podem ser ordenados. Abra "Clubes e recintos" e defina a localização ' +
      '(pode colar um link do Google Maps).'
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
 * Outros jogos do delegado que colidem com um instante, dentro de uma margem.
 * É o que responde a "este jogo foi adiado — o delegado já tem outro nessa data?".
 */
export function jogosDoDelegadoPerto(
  delegadoId: number,
  dataHora: string,
  margemMinutos: number,
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
    margemMinutos,
    excluirJogoId
  )
    .map((j) => obterJogoDetalhado(j.id))
    .filter((j): j is JogoDetalhado => j !== null)
}
