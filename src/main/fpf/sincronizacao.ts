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
  type AssociacaoFpf,
  type JogoJornadaFpf
} from './parsers'
import { normalizarNome } from './html'
import { lerCsv } from './csv'
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
  // Sem épocas não se leu o Centro de Resultados: mais vale falhar aqui, com
  // uma mensagem clara, do que deixar o coordenador com listas vazias.
  if (!epocas.length) {
    throw new Error(
      'A página do Centro de Resultados não veio no formato esperado — o site pode estar a bloquear ' +
        'os pedidos ou ter mudado. Tente de novo dentro de um minuto.'
    )
  }
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
      seasonDescricao: pedido.descricaoEpoca || null,
      nome: c.nome,
      organizacao: pedido.organizacao,
      ativa: true,
      nivelMinimo: c.nivelMinimo as never,
      usaDelegadoCampo: c.usaDelegadoCampo
    })
  )

  // 2) Ler a estrutura de cada competição. As competições por pontos têm
  //    jornadas a ir buscar à parte; as de eliminatórias já trazem os jogos
  //    na própria página.
  interface Tarefa {
    competicao: (typeof competicoes)[number]
    fase: string
    serie: string
    fixtureId: number
    numero: string | null
    /** Já lidos da página da competição (eliminatórias). */
    jogos: JogoJornadaFpf[] | null
  }

  const tarefas: Tarefa[] = []
  for (let i = 0; i < competicoes.length; i++) {
    const competicao = competicoes[i]
    progresso({ etapa: `Estrutura de ${competicao.nome}`, atual: i, total: competicoes.length, concluido: false })
    try {
      const html = await cliente.detalhesCompeticao(competicao.fpfCompetitionId!, pedido.seasonId)
      const detalhes = parseDetalhesCompeticao(html)
      // Verificação positiva: uma página de competição legítima traz sempre
      // pelo menos uma série. Zero séries significa que se leu outra coisa
      // qualquer — tipicamente uma página de bloqueio — e é preciso dizê-lo
      // em vez de concluir que a competição está vazia.
      if (!detalhes.fases.some((f) => f.series.length)) {
        erros.push(
          `${competicao.nome}: não foi possível ler a estrutura da competição. ` +
            'O site pode estar a bloquear os pedidos — espere um minuto e tente de novo.'
        )
        continue
      }
      for (const fase of detalhes.fases) {
        for (const serie of fase.series) {
          if (serie.jornadas.length) {
            for (const jornada of serie.jornadas) {
              tarefas.push({
                competicao,
                fase: fase.nome,
                serie: serie.nome,
                fixtureId: jornada.fixtureId,
                numero: jornada.numero,
                jogos: null
              })
            }
          } else if (serie.jogos.length) {
            tarefas.push({
              competicao,
              fase: fase.nome,
              serie: serie.nome,
              fixtureId: serie.serieId,
              numero: null,
              jogos: serie.jogos
            })
          }
        }
      }
    } catch (erro) {
      erros.push(`${competicao.nome}: ${(erro as Error).message}`)
    }
  }

  // 3) Ler os jogos de cada jornada que ainda falte.
  const contagem = new Map<number, number>()
  // Uma jornada que falhe deixa os seus jogos de fora do resultado. Marcar a
  // competição como não lida evita que esses jogos sejam depois tomados por
  // desaparecidos — um falso alarme muito pior do que não avisar.
  const competicoesIncompletas = new Set<number>()
  for (let i = 0; i < tarefas.length; i++) {
    const t = tarefas[i]
    progresso({
      etapa: `${t.competicao.nome} — ${t.serie}${t.numero ? `, jornada ${t.numero}` : ''}`,
      atual: i + 1,
      total: tarefas.length,
      concluido: false
    })
    try {
      const jogos = t.jogos ?? parseJogosJornada(await cliente.jogosDaJornada(t.fixtureId))
      for (const jogo of jogos) {
        const dataHora = resolverData(jogo.dataTexto, jogo.horaTexto, epoca)
        if (pedido.desde && dataHora && dataHora < pedido.desde) continue
        const chave = chaveNatural(t.competicao.id, t.fixtureId, jogo.clubeCasa, jogo.clubeFora)
        pendentes.set(chave, {
          chaveNatural: chave,
          competicaoId: t.competicao.id,
          competicaoNome: t.competicao.nome,
          fase: t.fase,
          serie: t.serie,
          jornada: t.numero,
          fixtureId: t.fixtureId,
          matchId: jogo.matchId,
          dataHora,
          clubeCasa: jogo.clubeCasa,
          clubeFora: jogo.clubeFora,
          recintoTexto: jogo.recinto,
          temResultado: jogo.resultado != null
        })
        contagem.set(t.competicao.id, (contagem.get(t.competicao.id) ?? 0) + 1)
      }
    } catch (erro) {
      competicoesIncompletas.add(t.competicao.id)
      erros.push(`${t.competicao.nome}, ${t.serie}: ${(erro as Error).message}`)
    }
  }

  // 4) Aplicar tudo o que mudou. A FPF é a fonte de verdade: guardar a data
  //    antiga de um jogo adiado seria pior do que atualizá-la, porque punha o
  //    coordenador a mandar um delegado no dia errado. O que muda em jogos já
  //    nomeados é devolvido em `sensiveis` para gerar alerta.
  //    Os jogos inalterados não são tocados.
  const clubesAntes = new Set(listarClubes().map((c) => c.nomeNormalizado))
  const diffs = calcularDiffs()
  const mudados = diffs.filter((d) => d.tipo !== 'INALTERADO')
  aplicarSincronizacao(mudados.map((d) => d.chaveNatural))

  const clubesCriados = listarClubes()
    .filter((c) => !clubesAntes.has(c.nomeNormalizado))
    .map((c) => c.nome)
    .sort()

  for (const competicao of competicoes) {
    const jogos = contagem.get(competicao.id) ?? 0
    const teveErro = erros.some((e) => e.startsWith(competicao.nome))
    resumo.push({
      id: competicao.id,
      nome: competicao.nome,
      jogos,
      lida: !teveErro && !competicoesIncompletas.has(competicao.id),
      aviso:
        jogos > 0 || teveErro
          ? null
          : 'Sem jogos — a competição pode ainda não ter calendário nesta época, ou todos os jogos são anteriores à data escolhida.'
    })
  }

  progresso({ etapa: 'Concluído', atual: tarefas.length, total: tarefas.length, concluido: true })

  return {
    competicoes: resumo,
    criados: mudados.filter((d) => d.tipo === 'NOVO').length,
    atualizados: mudados.filter((d) => d.tipo === 'ALTERADO').length,
    clubesCriados,
    sensiveis: mudados.filter((d) => d.tipo === 'ALTERADO' && d.temNomeacoes),
    erros
  }
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

/**
 * Chaves naturais vistas na última sincronização. Serve para descobrir quais dos
 * jogos guardados deixaram de aparecer no site — adiados sem data ou removidos.
 */
export function chavesPendentes(): Set<string> {
  return new Set(pendentes.keys())
}

/** Competições já guardadas para uma época, para pré-selecionar no ecrã de importação. */
export function competicoesGuardadas(seasonId: number): number[] {
  return listarCompeticoes(seasonId)
    .filter((c) => c.ativa && c.fpfCompetitionId != null)
    .map((c) => c.fpfCompetitionId!)
}

// ---------------------------------------------------------------------------
// Importação por ficheiro
// ---------------------------------------------------------------------------

export interface ResultadoImportacaoCsv {
  criados: number
  atualizados: number
  competicoesCriadas: string[]
  clubesCriados: string[]
  erros: { linha: number; mensagem: string }[]
  colunasIgnoradas: string[]
}

/**
 * Importa jogos de um ficheiro. Segue as mesmas regras da sincronização com a
 * FPF: cria clubes e recintos em falta, respeita o recinto configurado para o
 * clube da casa, e não toca em jogos que não mudaram.
 */
export function importarCsv(texto: string, seasonId: number, descricaoEpoca: string): ResultadoImportacaoCsv {
  const leitura = lerCsv(texto)
  const clubesAntes = new Set(listarClubes().map((c) => c.nomeNormalizado))
  const competicoesAntes = new Set(listarCompeticoes(seasonId).map((c) => normalizarNome(c.nome)))

  let criados = 0
  let atualizados = 0

  for (const linha of leitura.linhas) {
    const normalizada = normalizarNome(linha.competicao)
    let competicao = listarCompeticoes(seasonId).find((c) => normalizarNome(c.nome) === normalizada)
    if (!competicao) {
      competicao = guardarCompeticao({
        // Sem id da FPF: é uma competição só desta aplicação.
        fpfCompetitionId: null,
        seasonId,
        seasonDescricao: descricaoEpoca || null,
        nome: linha.competicao,
        organizacao: 'Importado de ficheiro',
        ativa: true,
        nivelMinimo: null,
        usaDelegadoCampo: true
      })
    }

    const casa = encontrarOuCriarClube(linha.clubeCasa)
    const fora = encontrarOuCriarClube(linha.clubeFora)

    let recintoId = recintoDoClube(casa.id, competicao.id)
    if (linha.recinto) {
      const recinto = encontrarOuCriarRecinto(linha.recinto)
      if (recintoId == null) definirRecintoDoClube(casa.id, null, recinto.id)
      recintoId = recinto.id
    }

    const chave = `csv:${chaveNatural(competicao.id, 0, linha.clubeCasa, linha.clubeFora)}`
    const existente = obterJogoPorChave(chave)
    guardarJogo({
      chaveNatural: chave,
      competicaoId: competicao.id,
      fase: null,
      serie: null,
      jornada: linha.jornada,
      fpfFixtureId: null,
      fpfMatchId: null,
      dataHora: linha.dataHora,
      clubeCasaId: casa.id,
      clubeForaId: fora.id,
      recintoId,
      recintoTextoFpf: linha.recinto,
      estado: 'AGENDADO'
    })
    if (existente) atualizados++
    else criados++
  }

  return {
    criados,
    atualizados,
    competicoesCriadas: listarCompeticoes(seasonId)
      .filter((c) => !competicoesAntes.has(normalizarNome(c.nome)))
      .map((c) => c.nome),
    clubesCriados: listarClubes()
      .filter((c) => !clubesAntes.has(c.nomeNormalizado))
      .map((c) => c.nome)
      .sort(),
    erros: leitura.erros,
    colunasIgnoradas: leitura.colunasIgnoradas
  }
}
