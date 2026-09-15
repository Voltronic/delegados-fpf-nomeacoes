import type { Bloqueio, Candidato, ContributoComponente, PesoComponente } from '@shared/tipos'
import { COMPONENTES_POR_ID } from './componentes'
import { dentroDaFolga, descreverQuando, folgaDe, formatarFolga, mesmoDia } from '../sync/conflitos'
import type { Agregados, ContextoAvaliacao, EntradaMotor, EstadoDelegado } from './tipos'

const DIA_MS = 86_400_000

/** Extrai a parte YYYY-MM-DD de um ISO local, sem passar por fusos horários. */
export function apenasData(iso: string): string {
  return iso.slice(0, 10)
}

function dentroDoIntervalo(data: string, inicio: string, fim: string): boolean {
  return data >= inicio && data <= fim
}

/**
 * Bloqueios rígidos. Um delegado bloqueado continua a ser devolvido e pontuado —
 * aparece na secção "Não elegíveis" e o coordenador pode forçá-lo com justificação.
 */
export function calcularBloqueios(entrada: EntradaMotor, estado: EstadoDelegado): Bloqueio[] {
  const bloqueios: Bloqueio[] = []
  const { delegado } = estado
  const { jogo, config } = entrada

  if (!delegado.ativo) {
    bloqueios.push({ codigo: 'INATIVO', descricao: 'Delegado inativo' })
  }

  if (entrada.jaNomeados.includes(delegado.id)) {
    bloqueios.push({ codigo: 'JA_NOMEADO', descricao: 'Já está nomeado para este jogo' })
  }

  if (jogo.nivelMinimo === 'ELITE' && delegado.nivel !== 'ELITE') {
    bloqueios.push({
      codigo: 'NIVEL_INSUFICIENTE',
      descricao: 'A competição exige delegado de elite'
    })
  }

  if (estado.clubesVetados.includes(jogo.clubeCasaId)) {
    bloqueios.push({ codigo: 'VETO_CLUBE', descricao: `Veto ao clube ${jogo.clubeCasaNome}` })
  }
  if (estado.clubesVetados.includes(jogo.clubeForaId)) {
    bloqueios.push({ codigo: 'VETO_CLUBE', descricao: `Veto ao clube ${jogo.clubeForaNome}` })
  }

  if (jogo.dataHora) {
    const dataJogo = apenasData(jogo.dataHora)
    const indisp = estado.indisponibilidades.find((i) => dentroDoIntervalo(dataJogo, i.dataInicio, i.dataFim))
    if (indisp) {
      bloqueios.push({
        codigo: 'INDISPONIVEL',
        descricao: indisp.motivo ? `Indisponível: ${indisp.motivo}` : 'Indisponível nesta data'
      })
    }

    // A folga conta a partir do jogo que se está a nomear: por omissão, nenhum
    // outro jogo do delegado pode começar nas 4h30 antes nem nas 3h depois.
    const inicio = jogo.dataHora
    const folga = folgaDe(config)
    const conflito = estado.agenda.find(
      (a) => a.jogoId !== jogo.jogoId && a.dataHora != null && dentroDaFolga(inicio, a.dataHora, folga)
    )
    if (conflito?.dataHora) {
      bloqueios.push({
        codigo: 'CONFLITO_HORARIO',
        descricao:
          `Já tem ${conflito.descricao ?? 'outro jogo'} ${descreverQuando(conflito.dataHora, inicio)} — ` +
          `sem a folga de ${formatarFolga(folga.antesMinutos)} antes e ${formatarFolga(folga.depoisMinutos)} depois deste jogo`
      })
    }
  }

  const distancia = entrada.distancias.get(delegado.id)
  if (config.distanciaMaximaKm > 0 && distancia && distancia.km > config.distanciaMaximaKm) {
    bloqueios.push({
      codigo: 'DISTANCIA_EXCESSIVA',
      descricao: `A ${Math.round(distancia.km)} km, acima do limite de ${config.distanciaMaximaKm} km`
    })
  }

  return bloqueios
}

function calcularAvisos(entrada: EntradaMotor, estado: EstadoDelegado): string[] {
  const avisos: string[] = []
  const distancia = entrada.distancias.get(estado.delegado.id)
  if (estado.delegado.lat == null || estado.delegado.lng == null) {
    avisos.push('Delegado sem morada geocodificada — distância não considerada')
  } else if (entrada.jogo.recintoLat == null || entrada.jogo.recintoLng == null) {
    avisos.push('Recinto sem coordenadas — distância não considerada')
  } else if (distancia?.fonte === 'HAVERSINE') {
    avisos.push('Distância estimada em linha reta (sem acesso ao serviço de rotas)')
  }
  if (distancia?.fonte === 'AVIAO') {
    avisos.push('Viagem de avião — só contam os km de casa ao aeroporto, ida e volta')
  }

  // Um jogo no mesmo dia fora da folga não impede a nomeação, mas o coordenador
  // tem de o ver, com a hora. Os que caem dentro da folga já são um bloqueio.
  const inicio = entrada.jogo.dataHora
  if (inicio) {
    const folga = folgaDe(entrada.config)
    const noMesmoDia = estado.agenda
      .filter(
        (a): a is { jogoId: number; dataHora: string; descricao?: string } =>
          a.jogoId !== entrada.jogo.jogoId &&
          a.dataHora != null &&
          mesmoDia(a.dataHora, inicio) &&
          !dentroDaFolga(inicio, a.dataHora, folga)
      )
      .sort((a, b) => a.dataHora.localeCompare(b.dataHora))
    for (const a of noMesmoDia) {
      avisos.push(`Já tem jogo neste dia: ${a.descricao ?? 'outro jogo'} ${descreverQuando(a.dataHora, inicio)}`)
    }
  }
  return avisos
}

function calcularAgregados(entrada: EntradaMotor, base: EstadoDelegado[]): Agregados {
  const conjunto = base.length > 0 ? base : entrada.delegados
  const kms = conjunto.map((e) => e.kmEpoca)
  const distancias = conjunto
    .map((e) => entrada.distancias.get(e.delegado.id)?.km)
    .filter((k): k is number => typeof k === 'number')
  const jogosComp = conjunto.map((e) => e.jogosPorCompeticao[entrada.jogo.competicaoId] ?? 0)

  const seguro = (valores: number[], fallback: number, fn: (v: number[]) => number): number =>
    valores.length ? fn(valores) : fallback

  return {
    kmMinimo: seguro(kms, 0, (v) => Math.min(...v)),
    kmMaximo: seguro(kms, 0, (v) => Math.max(...v)),
    kmMedio: seguro(kms, 0, (v) => v.reduce((a, b) => a + b, 0) / v.length),
    distanciaMinima: seguro(distancias, 0, (v) => Math.min(...v)),
    distanciaMaxima: seguro(distancias, 0, (v) => Math.max(...v)),
    jogosCompeticaoMinimo: seguro(jogosComp, 0, (v) => Math.min(...v)),
    jogosCompeticaoMaximo: seguro(jogosComp, 0, (v) => Math.max(...v))
  }
}

function pesosAtivos(pesos: PesoComponente[]): PesoComponente[] {
  return pesos.filter((p) => p.ativo && p.peso > 0 && COMPONENTES_POR_ID.has(p.componente))
}

/**
 * Avalia todos os delegados para um jogo e devolve-os ordenados: primeiro os
 * elegíveis por score decrescente, depois os bloqueados (também por score).
 */
export function avaliarCandidatos(entrada: EntradaMotor): Candidato[] {
  const ativos = pesosAtivos(entrada.config.pesos)
  const somaPesos = ativos.reduce((a, p) => a + p.peso, 0)

  const bloqueiosPorDelegado = new Map<number, Bloqueio[]>()
  for (const estado of entrada.delegados) {
    bloqueiosPorDelegado.set(estado.delegado.id, calcularBloqueios(entrada, estado))
  }

  // Normalizar apenas entre os elegíveis, para que um caso extremo bloqueado
  // (ex.: delegado inativo do outro lado do país) não distorça a escala.
  const elegiveis = entrada.delegados.filter((e) => (bloqueiosPorDelegado.get(e.delegado.id) ?? []).length === 0)
  const agregados = calcularAgregados(entrada, elegiveis)

  const candidatos: Candidato[] = entrada.delegados.map((estado) => {
    const distancia = entrada.distancias.get(estado.delegado.id) ?? null
    const ctx: ContextoAvaliacao = { entrada, estado, distancia, agregados }

    const componentes: ContributoComponente[] = ativos.map((peso) => {
      const componente = COMPONENTES_POR_ID.get(peso.componente)!
      const resultado = componente.avaliar(ctx)
      return {
        componente: peso.componente,
        etiqueta: peso.etiqueta,
        detalhe: resultado.detalhe,
        valorBruto: resultado.valorBruto,
        normalizado: resultado.normalizado,
        peso: peso.peso,
        contributo: resultado.normalizado * peso.peso
      }
    })

    const score = somaPesos > 0 ? (componentes.reduce((a, c) => a + c.contributo, 0) / somaPesos) * 100 : 0
    const bloqueios = bloqueiosPorDelegado.get(estado.delegado.id) ?? []

    return {
      delegadoId: estado.delegado.id,
      numero: estado.delegado.numero,
      nome: estado.delegado.nome,
      nivel: estado.delegado.nivel,
      elegivel: bloqueios.length === 0,
      bloqueios,
      avisos: calcularAvisos(entrada, estado),
      score: Math.round(score * 10) / 10,
      componentes,
      kmViagem: distancia ? Math.round(distancia.km * 2 * 10) / 10 : null,
      minutosViagem: distancia?.minutos != null ? Math.round(distancia.minutos * 2) : null,
      fonteDistancia: distancia?.fonte ?? null,
      kmEpoca: Math.round(estado.kmEpoca * 10) / 10,
      desvioKm: Math.round((estado.kmEpoca - agregados.kmMedio) * 10) / 10,
      vezesClubeCasa: estado.clubesFeitos[entrada.jogo.clubeCasaId] ?? 0,
      vezesClubeFora: estado.clubesFeitos[entrada.jogo.clubeForaId] ?? 0,
      jogosEpoca: estado.jogosEpoca,
      lat: estado.delegado.lat,
      lng: estado.delegado.lng
    }
  })

  return candidatos.sort((a, b) => {
    if (a.elegivel !== b.elegivel) return a.elegivel ? -1 : 1
    return b.score - a.score
  })
}

/** Dias entre duas datas ISO, útil para relatórios e testes. */
export function diasEntre(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DIA_MS
}
