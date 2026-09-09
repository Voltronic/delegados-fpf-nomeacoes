import type { Componente, ContextoAvaliacao, ResultadoComponente } from '../tipos'
import { mudaDeArquipelago } from '../../geo/ilhas'

/** Normaliza `valor` para 0..1 dentro de [min,max]; devolve 0.5 quando não há amplitude. */
export function normalizarInverso(valor: number, min: number, max: number): number {
  if (!Number.isFinite(valor)) return 0
  if (max - min < 1e-9) return 0.5
  const n = (max - valor) / (max - min)
  return Math.min(1, Math.max(0, n))
}

export function formatarKm(km: number): string {
  return `${Math.round(km).toLocaleString('pt-PT')} km`
}

/** Quem tem menos km acumulados na época fica em primeiro. */
const equilibrioKm: Componente = {
  id: 'equilibrioKm',
  avaliar({ estado, agregados }: ContextoAvaliacao): ResultadoComponente {
    const km = estado.kmEpoca
    const desvio = km - agregados.kmMedio
    const sinal = desvio > 0 ? '+' : '−'
    return {
      valorBruto: km,
      normalizado: normalizarInverso(km, agregados.kmMinimo, agregados.kmMaximo),
      detalhe: `${formatarKm(km)} na época (${sinal}${formatarKm(Math.abs(desvio))} vs média)`
    }
  }
}

/**
 * Prioriza quem ainda não fez estes clubes. Não é um bloqueio: quem já fez
 * continua elegível, apenas com menos pontuação, decaindo a cada repetição.
 */
const novidadeClube: Componente = {
  id: 'novidadeClube',
  avaliar({ entrada, estado }: ContextoAvaliacao): ResultadoComponente {
    const { clubeCasaId, clubeForaId, clubeCasaNome, clubeForaNome } = entrada.jogo
    const casa = estado.clubesFeitos[clubeCasaId] ?? 0
    const fora = estado.clubesFeitos[clubeForaId] ?? 0
    const total = casa + fora
    const partes: string[] = []
    if (casa > 0) partes.push(`${clubeCasaNome} ${casa}×`)
    if (fora > 0) partes.push(`${clubeForaNome} ${fora}×`)
    return {
      valorBruto: total,
      normalizado: 1 / (1 + total),
      detalhe: partes.length ? `já fez ${partes.join(', ')}` : 'nunca fez estes clubes'
    }
  }
}

/**
 * Favorece quem está mais perto. É este componente que produz naturalmente o
 * padrão Norte/Centro/Sul, sem nunca impedir uma deslocação longa.
 */
const proximidade: Componente = {
  id: 'proximidade',
  avaliar({ distancia, agregados }: ContextoAvaliacao): ResultadoComponente {
    if (!distancia) {
      return { valorBruto: 0, normalizado: 0, detalhe: 'distância desconhecida' }
    }
    return {
      valorBruto: distancia.km,
      normalizado: normalizarInverso(distancia.km, agregados.distanciaMinima, agregados.distanciaMaxima),
      detalhe: `${formatarKm(distancia.km * 2)} ida e volta`
    }
  }
}

/**
 * Reserva os delegados de elite para os jogos que os exigem: num jogo sem nível
 * mínimo, um delegado principal é preferido para não gastar um elite.
 */
const adequacaoNivel: Componente = {
  id: 'adequacaoNivel',
  avaliar({ entrada, estado }: ContextoAvaliacao): ResultadoComponente {
    const exigeElite = entrada.jogo.nivelMinimo === 'ELITE'
    const eElite = estado.delegado.nivel === 'ELITE'
    if (exigeElite) {
      return { valorBruto: 1, normalizado: 1, detalhe: 'jogo de nível elite' }
    }
    return {
      valorBruto: eElite ? 0 : 1,
      normalizado: eElite ? 0.6 : 1,
      detalhe: eElite ? 'elite disponível para jogo sem exigência' : 'nível adequado ao jogo'
    }
  }
}

/** Distribui os jogos de cada competição por todos os delegados. */
const equilibrioCompeticao: Componente = {
  id: 'equilibrioCompeticao',
  avaliar({ entrada, estado, agregados }: ContextoAvaliacao): ResultadoComponente {
    const feitos = estado.jogosPorCompeticao[entrada.jogo.competicaoId] ?? 0
    return {
      valorBruto: feitos,
      normalizado: normalizarInverso(feitos, agregados.jogosCompeticaoMinimo, agregados.jogosCompeticaoMaximo),
      detalhe: feitos === 0 ? 'primeiro jogo nesta competição' : `${feitos} jogos nesta competição`
    }
  }
}

const MAX_DIAS_DESCANSO = 21

/** Favorece quem está há mais tempo sem ser nomeado. */
const descanso: Componente = {
  id: 'descanso',
  avaliar({ entrada, estado }: ContextoAvaliacao): ResultadoComponente {
    const referencia = entrada.agora ?? entrada.jogo.dataHora
    if (!estado.ultimaNomeacaoEm || !referencia) {
      return { valorBruto: MAX_DIAS_DESCANSO, normalizado: 1, detalhe: 'sem nomeações recentes' }
    }
    const dias = Math.max(
      0,
      (new Date(referencia).getTime() - new Date(estado.ultimaNomeacaoEm).getTime()) / 86_400_000
    )
    return {
      valorBruto: dias,
      normalizado: Math.min(1, dias / MAX_DIAS_DESCANSO),
      detalhe: `${Math.round(dias)} dias desde a última nomeação`
    }
  }
}

/**
 * Penaliza pesadamente as deslocações que obrigam a sair do arquipélago.
 *
 * Um voo do continente para uma ilha (ou o contrário) custa à FPF muito mais do
 * que qualquer viagem por estrada, e os km contabilizados não o mostram: numa
 * ida a uma ilha só contam os quilómetros até ao aeroporto, o que faz um jogo
 * nos Açores parecer mais barato do que uma ida ao Algarve.
 *
 * Voar **dentro** do mesmo arquipélago não é penalizado: para quem vive nos
 * Açores, ir de São Miguel à Terceira é o equivalente a uma deslocação normal,
 * e penalizá-lo deixaria os jogos das ilhas sem candidatos naturais.
 *
 * Não é um bloqueio: alguém tem de ir. É uma desvantagem grande, que só cede
 * quando não há mesmo alternativa.
 */
const custoAviao: Componente = {
  id: 'custoAviao',
  avaliar({ entrada, estado, distancia }: ContextoAvaliacao): ResultadoComponente {
    // Sem distância não se sabe se há voo (recinto por localizar): não se
    // penaliza por suspeita.
    if (!distancia || distancia.fonte !== 'AVIAO') {
      return { valorBruto: 0, normalizado: 1, detalhe: 'viagem por estrada' }
    }
    const { lat, lng } = estado.delegado
    const { recintoLat, recintoLng } = entrada.jogo
    if (lat == null || lng == null || recintoLat == null || recintoLng == null) {
      return { valorBruto: 0, normalizado: 1, detalhe: 'sem coordenadas para avaliar a viagem' }
    }
    if (!mudaDeArquipelago({ lat, lng }, { lat: recintoLat, lng: recintoLng })) {
      return { valorBruto: 0, normalizado: 1, detalhe: 'voo dentro do arquipélago' }
    }
    return { valorBruto: 1, normalizado: 0, detalhe: 'exige voo para fora do arquipélago' }
  }
}

export const COMPONENTES: Componente[] = [
  custoAviao,
  equilibrioKm,
  novidadeClube,
  proximidade,
  adequacaoNivel,
  equilibrioCompeticao,
  descanso
]

export const COMPONENTES_POR_ID = new Map(COMPONENTES.map((c) => [c.id, c]))
