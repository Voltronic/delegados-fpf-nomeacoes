import type {
  ConfiguracaoMotor,
  Delegado,
  FonteDistancia,
  NivelDelegado,
  PapelNomeacao
} from '@shared/tipos'

/** Tudo o que o motor precisa de saber sobre o jogo a nomear. */
export interface ContextoJogo {
  jogoId: number
  dataHora: string | null
  competicaoId: number
  competicaoNome: string
  nivelMinimo: NivelDelegado | null
  clubeCasaId: number
  clubeForaId: number
  clubeCasaNome: string
  clubeForaNome: string
  recintoId: number | null
  recintoNome: string | null
  recintoLat: number | null
  recintoLng: number | null
}

/** Estado acumulado de um delegado na época, pré-calculado uma vez por avaliação. */
export interface EstadoDelegado {
  delegado: Delegado
  /** Km confirmados na época (ida e volta já contabilizados). */
  kmEpoca: number
  jogosEpoca: number
  /** clubeId -> nº de jogos desse clube já feitos na época. */
  clubesFeitos: Record<number, number>
  /** competicaoId -> nº de jogos já feitos nessa competição. */
  jogosPorCompeticao: Record<number, number>
  indisponibilidades: { dataInicio: string; dataFim: string; motivo: string | null }[]
  clubesVetados: number[]
  /** Jogos já nomeados, para deteção de conflito de horário. */
  agenda: { jogoId: number; dataHora: string | null }[]
  ultimaNomeacaoEm: string | null
}

export interface Distancia {
  /** Distância só de ida, em km. */
  km: number
  /** Duração só de ida, em minutos. */
  minutos: number | null
  fonte: FonteDistancia
}

export interface EntradaMotor {
  jogo: ContextoJogo
  delegados: EstadoDelegado[]
  /** delegadoId -> distância de ida até ao recinto. */
  distancias: Map<number, Distancia>
  config: ConfiguracaoMotor
  papel: PapelNomeacao
  /** Delegados já nomeados para este jogo (noutro papel). */
  jaNomeados: number[]
  /** Data de referência para cálculos de descanso; por omissão, a do jogo. */
  agora?: string
}

/** Estatísticas do conjunto, calculadas uma vez e partilhadas pelos componentes. */
export interface Agregados {
  kmMinimo: number
  kmMaximo: number
  kmMedio: number
  distanciaMinima: number
  distanciaMaxima: number
  jogosCompeticaoMinimo: number
  jogosCompeticaoMaximo: number
}

export interface ContextoAvaliacao {
  entrada: EntradaMotor
  estado: EstadoDelegado
  distancia: Distancia | null
  agregados: Agregados
}

export interface ResultadoComponente {
  /** Valor bruto, na unidade natural do componente. */
  valorBruto: number
  /** 0..1, onde 1 é o candidato mais desejável. */
  normalizado: number
  /** Texto curto para o cartão do candidato. */
  detalhe: string
}

export interface Componente {
  id: string
  avaliar(ctx: ContextoAvaliacao): ResultadoComponente
}
