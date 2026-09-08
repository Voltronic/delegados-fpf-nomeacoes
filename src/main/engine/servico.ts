import type {
  Candidato,
  ConfiguracaoMotor,
  JogoDetalhado,
  PapelNomeacao,
  PropostaAutomatica,
  ResultadoPropostaAutomatica
} from '@shared/tipos'
import { escreverConfig, lerConfig } from '../db'
import {
  estatisticasPorDelegado,
  guardarNomeacao,
  listarCompeticoes,
  listarDelegados,
  listarIndisponibilidades,
  listarJogos,
  listarVetos,
  obterJogoDetalhado,
  obterRecinto
} from '../db/repos'
import { obterDistancia } from '../geo'
import { avaliarCandidatos } from './motor'
import { gerarProposta } from './automatico'
import { PESOS_POR_OMISSAO } from './pesos'
import type { ContextoJogo, Distancia, EntradaMotor, EstadoDelegado } from './tipos'

export function obterConfiguracaoMotor(): ConfiguracaoMotor {
  let pesos = PESOS_POR_OMISSAO
  try {
    const guardados = JSON.parse(lerConfig('motor.pesos') ?? '[]') as ConfiguracaoMotor['pesos']
    if (Array.isArray(guardados) && guardados.length) {
      // Componentes novos entram com o valor por omissão sem exigir migração.
      pesos = PESOS_POR_OMISSAO.map((p) => guardados.find((g) => g.componente === p.componente) ?? p)
    }
  } catch {
    // Configuração corrompida: volta-se aos pesos por omissão.
  }
  return {
    pesos,
    distanciaMaximaKm: Number(lerConfig('motor.distanciaMaximaKm') ?? '0'),
    margemEntreJogosMinutos: Number(lerConfig('motor.margemEntreJogosMinutos') ?? '180')
  }
}

export function guardarConfiguracaoMotor(config: ConfiguracaoMotor): ConfiguracaoMotor {
  escreverConfig('motor.pesos', JSON.stringify(config.pesos))
  escreverConfig('motor.distanciaMaximaKm', String(config.distanciaMaximaKm))
  escreverConfig('motor.margemEntreJogosMinutos', String(config.margemEntreJogosMinutos))
  return obterConfiguracaoMotor()
}

function contextoDoJogo(jogo: JogoDetalhado): ContextoJogo {
  const competicao = listarCompeticoes().find((c) => c.id === jogo.competicaoId)
  return {
    jogoId: jogo.id,
    dataHora: jogo.dataHora,
    competicaoId: jogo.competicaoId,
    competicaoNome: jogo.competicaoNome,
    nivelMinimo: competicao?.nivelMinimo ?? null,
    clubeCasaId: jogo.clubeCasaId,
    clubeForaId: jogo.clubeForaId,
    clubeCasaNome: jogo.clubeCasaNome,
    clubeForaNome: jogo.clubeForaNome,
    recintoId: jogo.recintoId,
    recintoNome: jogo.recintoNome,
    recintoLat: jogo.recintoLat,
    recintoLng: jogo.recintoLng
  }
}

function estadosDosDelegados(seasonId?: number): EstadoDelegado[] {
  const delegados = listarDelegados(true)
  const stats = estatisticasPorDelegado(seasonId)
  return delegados.map((delegado) => {
    const e = stats.get(delegado.id)
    return {
      delegado,
      kmEpoca: e?.km ?? 0,
      jogosEpoca: e?.jogos ?? 0,
      clubesFeitos: e?.clubes ?? {},
      jogosPorCompeticao: e?.competicoes ?? {},
      indisponibilidades: listarIndisponibilidades(delegado.id).map((i) => ({
        dataInicio: i.dataInicio,
        dataFim: i.dataFim,
        motivo: i.motivo
      })),
      clubesVetados: listarVetos(delegado.id).map((v) => v.clubeId),
      agenda: e?.agenda ?? [],
      ultimaNomeacaoEm: e?.ultimaNomeacaoEm ?? null
    }
  })
}

/** Distâncias de ida entre cada delegado e o recinto do jogo, com cache. */
async function distanciasParaJogo(
  jogo: JogoDetalhado,
  estados: EstadoDelegado[]
): Promise<Map<number, Distancia>> {
  const mapa = new Map<number, Distancia>()
  if (jogo.recintoId == null) return mapa
  const recinto = obterRecinto(jogo.recintoId)
  const destino = recinto?.lat != null && recinto.lng != null ? { lat: recinto.lat, lng: recinto.lng } : null

  for (const estado of estados) {
    const { lat, lng, id } = estado.delegado
    const origem = lat != null && lng != null ? { lat, lng } : null
    const resultado = await obterDistancia(id, jogo.recintoId, origem, destino)
    if (resultado) mapa.set(id, resultado)
  }
  return mapa
}

export async function candidatosParaJogo(jogoId: number, papel: PapelNomeacao): Promise<Candidato[]> {
  const jogo = obterJogoDetalhado(jogoId)
  if (!jogo) return []
  const competicao = listarCompeticoes().find((c) => c.id === jogo.competicaoId)
  const estados = estadosDosDelegados(competicao?.seasonId)
  const distancias = await distanciasParaJogo(jogo, estados)

  return avaliarCandidatos({
    jogo: contextoDoJogo(jogo),
    delegados: estados,
    distancias,
    config: obterConfiguracaoMotor(),
    papel,
    jaNomeados: jogo.nomeacoes.filter((n) => n.papel !== papel).map((n) => n.delegadoId)
  })
}

export interface PedidoNomeacao {
  jogoId: number
  delegadoId: number
  papel: PapelNomeacao
  motivoOverride?: string | null
}

/** Nomeia um delegado, congelando os km da viagem no momento da nomeação. */
export async function nomear(pedido: PedidoNomeacao): Promise<JogoDetalhado | null> {
  const jogo = obterJogoDetalhado(pedido.jogoId)
  if (!jogo) return null

  // O mesmo delegado não pode acumular os dois papéis no mesmo jogo.
  const noutroPapel = jogo.nomeacoes.find(
    (n) => n.delegadoId === pedido.delegadoId && n.papel !== pedido.papel
  )
  if (noutroPapel) {
    throw new Error(
      `${noutroPapel.delegadoNome} já está nomeado para este jogo como delegado ` +
        `${noutroPapel.papel === 'PRINCIPAL' ? 'principal' : 'de campo'}. Remova essa nomeação primeiro.`
    )
  }

  let km: number | null = null
  let minutos: number | null = null
  let fonte: Candidato['fonteDistancia'] = null

  if (jogo.recintoId != null) {
    const delegado = listarDelegados(true).find((d) => d.id === pedido.delegadoId)
    const recinto = obterRecinto(jogo.recintoId)
    const origem = delegado?.lat != null && delegado.lng != null ? { lat: delegado.lat, lng: delegado.lng } : null
    const destino = recinto?.lat != null && recinto.lng != null ? { lat: recinto.lat, lng: recinto.lng } : null
    const distancia = await obterDistancia(pedido.delegadoId, jogo.recintoId, origem, destino)
    if (distancia) {
      km = Math.round(distancia.km * 2 * 10) / 10
      minutos = distancia.minutos != null ? Math.round(distancia.minutos * 2) : null
      fonte = distancia.fonte
    }
  }

  guardarNomeacao({
    jogoId: pedido.jogoId,
    delegadoId: pedido.delegadoId,
    papel: pedido.papel,
    km,
    minutos,
    fonteDistancia: fonte,
    estado: 'CONFIRMADA',
    motivoOverride: pedido.motivoOverride ?? null
  })

  return obterJogoDetalhado(pedido.jogoId)
}

/**
 * Proposta automática para um conjunto de jogos. Devolve apenas sugestões — nada
 * é gravado até o coordenador aceitar no ecrã de revisão.
 */
export async function propostaAutomatica(jogoIds: number[]): Promise<ResultadoPropostaAutomatica> {
  const vazio: ResultadoPropostaAutomatica = { propostas: [], semSugestao: [], jaCompletos: 0 }
  const todos = listarJogos()
  const jogos = todos.filter((j) => jogoIds.includes(j.id))
  if (!jogos.length) return vazio

  const competicoes = listarCompeticoes()
  const seasonId = competicoes.find((c) => c.id === jogos[0].competicaoId)?.seasonId
  const estados = estadosDosDelegados(seasonId)
  const config = obterConfiguracaoMotor()

  const entradas: EntradaMotor[] = []
  let jaCompletos = 0
  for (const jogo of jogos) {
    // Salta os jogos já totalmente nomeados.
    const usaCampo = competicoes.find((c) => c.id === jogo.competicaoId)?.usaDelegadoCampo ?? false
    if (jogo.nomeacoes.length >= (usaCampo ? 2 : 1)) {
      jaCompletos++
      continue
    }
    entradas.push({
      jogo: contextoDoJogo(jogo),
      delegados: estados,
      distancias: await distanciasParaJogo(jogo, estados),
      config,
      papel: 'PRINCIPAL',
      jaNomeados: jogo.nomeacoes.map((n) => n.delegadoId)
    })
  }

  const { atribuicoes, semSugestao } = gerarProposta({
    jogos: entradas,
    usaDelegadoCampo: (jogoId) => {
      const jogo = jogos.find((j) => j.id === jogoId)
      return competicoes.find((c) => c.id === jogo?.competicaoId)?.usaDelegadoCampo ?? false
    }
  })

  const nomes = new Map(listarDelegados(true).map((d) => [d.id, `${d.numero} — ${d.nome}`]))
  const propostas = new Map<number, PropostaAutomatica>()
  for (const a of atribuicoes) {
    const jogo = jogos.find((j) => j.id === a.jogoId)!
    let proposta = propostas.get(a.jogoId)
    if (!proposta) {
      proposta = {
        jogoId: a.jogoId,
        descricaoJogo: `${jogo.competicaoNome}: ${jogo.clubeCasaNome} × ${jogo.clubeForaNome}`,
        dataHora: jogo.dataHora,
        principal: null,
        campo: null,
        motivo: a.motivo
      }
      propostas.set(a.jogoId, proposta)
    }
    const entrada = { delegadoId: a.delegadoId, nome: nomes.get(a.delegadoId) ?? '?', km: a.km }
    if (a.papel === 'PRINCIPAL') proposta.principal = entrada
    else proposta.campo = entrada
  }

  // Agrupar os papéis em falta do mesmo jogo numa só linha de explicação.
  const faltas = new Map<number, string[]>()
  for (const s of semSugestao) {
    const atual = faltas.get(s.jogoId) ?? []
    for (const m of s.motivos) if (!atual.includes(m)) atual.push(m)
    faltas.set(s.jogoId, atual)
  }

  return {
    propostas: [...propostas.values()].sort((a, b) =>
      (a.dataHora ?? '').localeCompare(b.dataHora ?? '')
    ),
    semSugestao: [...faltas.entries()]
      .map(([jogoId, motivos]) => {
        const jogo = jogos.find((j) => j.id === jogoId)!
        return {
          jogoId,
          descricaoJogo: `${jogo.competicaoNome}: ${jogo.clubeCasaNome} × ${jogo.clubeForaNome}`,
          dataHora: jogo.dataHora,
          motivos
        }
      })
      .sort((a, b) => (a.dataHora ?? '').localeCompare(b.dataHora ?? '')),
    jaCompletos
  }
}

/** Aplica uma proposta previamente revista pelo coordenador. */
export async function aplicarProposta(propostas: PropostaAutomatica[]): Promise<number> {
  let aplicadas = 0
  for (const proposta of propostas) {
    if (proposta.principal) {
      await nomear({ jogoId: proposta.jogoId, delegadoId: proposta.principal.delegadoId, papel: 'PRINCIPAL' })
      aplicadas++
    }
    if (proposta.campo) {
      await nomear({ jogoId: proposta.jogoId, delegadoId: proposta.campo.delegadoId, papel: 'CAMPO' })
      aplicadas++
    }
  }
  return aplicadas
}
