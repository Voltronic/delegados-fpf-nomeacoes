import type {
  CompeticaoFpf,
  DiffJogo,
  EpocaFpf,
  OrganizacaoFpf,
  ProgressoSincronizacao,
  ResultadoSincronizacao
} from '@shared/tipos'
import { ClienteFpf } from './cliente'
import {
  anosDaEpoca,
  chaveNatural,
  parseAssociacoes,
  parseDetalhesCompeticao,
  parseEpocas,
  parseJogosJornada,
  parseOrganizacoes,
  resolverData,
  type AssociacaoFpf
} from './parsers'
import { normalizarNome } from './html'
import {
  definirRecintoDoClube,
  encontrarOuCriarClube,
  encontrarOuCriarRecinto,
  guardarCompeticao,
  guardarJogo,
  listarClubes,
  listarCompeticoes,
  listarNomeacoesDoJogo,
  obterJogoPorChave,
  recintoDoClube
} from '../db/repos'

export interface Catalogo {
  epocas: EpocaFpf[]
  organizacoes: OrganizacaoFpf[]
  associacoes: AssociacaoFpf[]
}

export async function obterCatalogo(cliente: ClienteFpf, seasonId?: number): Promise<Catalogo> {
  const indice = await cliente.indiceCompeticoes()
  const epocas = parseEpocas(indice)
  const associacoes = parseAssociacoes(indice)

  const epocaDoIndice = epocas.find((e) => e.selecionada)?.seasonId ?? epocas[0]?.seasonId
  const epocaAlvo = seasonId ?? epocaDoIndice

  let organizacoes = epocaAlvo != null ? parseOrganizacoes(await cliente.organizacoesPorEpoca(epocaAlvo)) : []
  // O índice só serve de recurso quando a época pedida é mesmo a que ele mostra:
  // os ids de competição mudam de época para época, e misturá-los importaria
  // jogos errados sem dar por isso.
  if (!organizacoes.length && epocaAlvo === epocaDoIndice) {
    organizacoes = parseOrganizacoes(indice)
  }

  return {
    epocas: epocas.map((e) => ({ ...e, selecionada: e.seasonId === epocaAlvo })),
    organizacoes,
    associacoes
  }
}

export async function competicoesDaAssociacao(
  cliente: ClienteFpf,
  associationId: number,
  seasonId: number
): Promise<CompeticaoFpf[]> {
  const html = await cliente.competicoesPorAssociacao(associationId, seasonId)
  return parseOrganizacoes(html).flatMap((o) => o.competicoes)
}

// ---------------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------------

interface JogoPreparado {
  chaveNatural: string
  competicaoId: number
  competicaoNome: string
  fase: string | null
  serie: string | null
  jornada: string | null
  fixtureId: number
  matchId: number | null
  dataHora: string | null
  clubeCasa: string
  clubeFora: string
  recintoTexto: string | null
  temResultado: boolean
}

/** Preparações pendentes de aplicação, por chave natural. */
const pendentes = new Map<string, JogoPreparado>()

export interface PedidoSincronizacao {
  seasonId: number
  descricaoEpoca: string
  organizacao: string
  /** fpfCompetitionId das competições a sincronizar. */
  competicoes: { competitionId: number; nome: string; nivelMinimo: string | null; usaDelegadoCampo: boolean }[]
  /** Só importa jogos a partir desta data (ISO). Vazio = todos. */
  desde?: string
}

export async function sincronizar(
  cliente: ClienteFpf,
  pedido: PedidoSincronizacao,
  progresso: (p: ProgressoSincronizacao) => void
): Promise<ResultadoSincronizacao> {
  pendentes.clear()
  const epoca = anosDaEpoca(pedido.descricaoEpoca)
  const erros: string[] = []
  const resumo: ResultadoSincronizacao['competicoes'] = []

  // 1) Garantir que cada competição existe em base de dados.
  const competicoes = pedido.competicoes.map((c) =>
    guardarCompeticao({
      fpfCompetitionId: c.competitionId,
      seasonId: pedido.seasonId,
      nome: c.nome,
      organizacao: pedido.organizacao,
      ativa: true,
      nivelMinimo: c.nivelMinimo as never,
      usaDelegadoCampo: c.usaDelegadoCampo
    })
  )

  // 2) Recolher as jornadas de todas as competições.
  const jornadas: { competicao: (typeof competicoes)[number]; fase: string; serie: string; fixtureId: number; numero: string }[] = []
  for (let i = 0; i < competicoes.length; i++) {
    const competicao = competicoes[i]
    progresso({ etapa: `Jornadas de ${competicao.nome}`, atual: i, total: competicoes.length, concluido: false })
    try {
      const html = await cliente.detalhesCompeticao(competicao.fpfCompetitionId!, pedido.seasonId)
      const detalhes = parseDetalhesCompeticao(html)
      for (const fase of detalhes.fases) {
        for (const serie of fase.series) {
          for (const jornada of serie.jornadas) {
            jornadas.push({
              competicao,
              fase: fase.nome,
              serie: serie.nome,
              fixtureId: jornada.fixtureId,
              numero: jornada.numero
            })
          }
        }
      }
    } catch (erro) {
      erros.push(`${competicao.nome}: ${(erro as Error).message}`)
    }
  }

  // 3) Ler os jogos de cada jornada.
  const contagem = new Map<number, number>()
  for (let i = 0; i < jornadas.length; i++) {
    const j = jornadas[i]
    progresso({
      etapa: `${j.competicao.nome} — ${j.serie}, jornada ${j.numero}`,
      atual: i + 1,
      total: jornadas.length,
      concluido: false
    })
    try {
      const html = await cliente.jogosDaJornada(j.fixtureId)
      for (const jogo of parseJogosJornada(html)) {
        const dataHora = resolverData(jogo.dataTexto, jogo.horaTexto, epoca)
        if (pedido.desde && dataHora && dataHora < pedido.desde) continue
        const chave = chaveNatural(j.competicao.id, j.fixtureId, jogo.clubeCasa, jogo.clubeFora)
        pendentes.set(chave, {
          chaveNatural: chave,
          competicaoId: j.competicao.id,
          competicaoNome: j.competicao.nome,
          fase: j.fase,
          serie: j.serie,
          jornada: j.numero,
          fixtureId: j.fixtureId,
          matchId: jogo.matchId,
          dataHora,
          clubeCasa: jogo.clubeCasa,
          clubeFora: jogo.clubeFora,
          recintoTexto: jogo.recinto,
          temResultado: jogo.resultado != null
        })
        contagem.set(j.competicao.id, (contagem.get(j.competicao.id) ?? 0) + 1)
      }
    } catch (erro) {
      erros.push(`Jornada ${j.numero} de ${j.competicao.nome}: ${(erro as Error).message}`)
    }
  }

  for (const competicao of competicoes) {
    resumo.push({ id: competicao.id, nome: competicao.nome, jogos: contagem.get(competicao.id) ?? 0 })
  }

  progresso({ etapa: 'Concluído', atual: jornadas.length, total: jornadas.length, concluido: true })

  return { competicoes: resumo, diffs: calcularDiffs(), clubesNovos: clubesNovos(), erros }
}

function calcularDiffs(): DiffJogo[] {
  const diffs: DiffJogo[] = []
  for (const p of pendentes.values()) {
    const existente = obterJogoPorChave(p.chaveNatural)
    const base: Omit<DiffJogo, 'tipo' | 'alteracoes' | 'temNomeacoes' | 'jogoId'> = {
      chaveNatural: p.chaveNatural,
      competicaoNome: p.competicaoNome,
      clubeCasa: p.clubeCasa,
      clubeFora: p.clubeFora,
      jornada: p.jornada,
      dataHora: p.dataHora,
      recinto: p.recintoTexto
    }

    if (!existente) {
      diffs.push({ ...base, tipo: 'NOVO', alteracoes: [], temNomeacoes: false, jogoId: null })
      continue
    }

    const alteracoes: DiffJogo['alteracoes'] = []
    if ((existente.dataHora ?? null) !== (p.dataHora ?? null)) {
      alteracoes.push({ campo: 'Data e hora', antes: existente.dataHora, depois: p.dataHora })
    }
    const recintoAntes = existente.recintoTextoFpf ?? null
    if (normalizarNome(recintoAntes ?? '') !== normalizarNome(p.recintoTexto ?? '')) {
      alteracoes.push({ campo: 'Recinto', antes: recintoAntes, depois: p.recintoTexto })
    }

    const temNomeacoes = listarNomeacoesDoJogo(existente.id).length > 0
    diffs.push({
      ...base,
      tipo: alteracoes.length ? 'ALTERADO' : 'INALTERADO',
      alteracoes,
      temNomeacoes,
      jogoId: existente.id
    })
  }

  const ordem = { ALTERADO: 0, NOVO: 1, INALTERADO: 2 }
  return diffs.sort((a, b) => {
    if (a.tipo !== b.tipo) return ordem[a.tipo] - ordem[b.tipo]
    // Dentro de "alterado", os que já têm delegado nomeado primeiro.
    if (a.temNomeacoes !== b.temNomeacoes) return a.temNomeacoes ? -1 : 1
    return (a.dataHora ?? '').localeCompare(b.dataHora ?? '')
  })
}

function clubesNovos(): string[] {
  const conhecidos = new Set(listarClubes().map((c) => c.nomeNormalizado))
  const novos = new Map<string, string>()
  for (const p of pendentes.values()) {
    for (const nome of [p.clubeCasa, p.clubeFora]) {
      const norm = normalizarNome(nome)
      if (!conhecidos.has(norm) && !novos.has(norm)) novos.set(norm, nome)
    }
  }
  return [...novos.values()].sort()
}

/**
 * Aplica as alterações preparadas. Ao criar um jogo, resolve o recinto pela
 * configuração do clube (que pode diferir por competição) e, se o clube ainda
 * não tiver recinto associado, adota o que veio da FPF — assim a primeira
 * importação preenche sozinha o mapa de clubes e recintos.
 */
export function aplicarSincronizacao(chaves: string[]): { aplicados: number; ignorados: number } {
  let aplicados = 0
  let ignorados = 0

  for (const chave of chaves) {
    const p = pendentes.get(chave)
    if (!p) {
      ignorados++
      continue
    }
    const casa = encontrarOuCriarClube(p.clubeCasa)
    const fora = encontrarOuCriarClube(p.clubeFora)

    let recintoId = recintoDoClube(casa.id, p.competicaoId)
    if (recintoId == null && p.recintoTexto) {
      const recinto = encontrarOuCriarRecinto(p.recintoTexto)
      definirRecintoDoClube(casa.id, null, recinto.id)
      recintoId = recinto.id
    }

    guardarJogo({
      chaveNatural: p.chaveNatural,
      competicaoId: p.competicaoId,
      fase: p.fase,
      serie: p.serie,
      jornada: p.jornada,
      fpfFixtureId: p.fixtureId,
      fpfMatchId: p.matchId,
      dataHora: p.dataHora,
      clubeCasaId: casa.id,
      clubeForaId: fora.id,
      recintoId,
      recintoTextoFpf: p.recintoTexto,
      estado: p.temResultado ? 'REALIZADO' : 'AGENDADO'
    })
    aplicados++
  }

  return { aplicados, ignorados }
}

/** Competições já guardadas para uma época, para pré-selecionar no ecrã de importação. */
export function competicoesGuardadas(seasonId: number): number[] {
  return listarCompeticoes(seasonId)
    .filter((c) => c.ativa && c.fpfCompetitionId != null)
    .map((c) => c.fpfCompetitionId!)
}
