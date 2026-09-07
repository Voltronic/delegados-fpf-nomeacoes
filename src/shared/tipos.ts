/** Tipos de domínio partilhados entre o processo main e o renderer. */

export type NivelDelegado = 'ELITE' | 'PRINCIPAL'
export type PapelNomeacao = 'PRINCIPAL' | 'CAMPO'
export type EstadoNomeacao = 'SUGERIDA' | 'CONFIRMADA' | 'CANCELADA'
export type FonteDistancia = 'OSRM' | 'HAVERSINE' | 'MANUAL'
export type EstadoJogo = 'AGENDADO' | 'REALIZADO' | 'ADIADO' | 'CANCELADO'

export interface Delegado {
  id: number
  numero: string
  nome: string
  morada: string | null
  lat: number | null
  lng: number | null
  nivel: NivelDelegado
  telefone: string | null
  email: string | null
  ativo: boolean
  notas: string | null
  coordsManuais: boolean
}

export interface Indisponibilidade {
  id: number
  delegadoId: number
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
  motivo: string | null
}

export interface VetoClube {
  id: number
  delegadoId: number
  clubeId: number
  clubeNome?: string
  motivo: string | null
}

export interface Clube {
  id: number
  nome: string
  nomeNormalizado: string
  notas: string | null
}

export interface Recinto {
  id: number
  nome: string
  morada: string | null
  lat: number | null
  lng: number | null
  coordsManuais: boolean
  geocodificadoEm: string | null
}

export interface ClubeRecinto {
  id: number
  clubeId: number
  competicaoId: number | null // null = recinto por omissão do clube
  recintoId: number
}

export interface Competicao {
  id: number
  fpfCompetitionId: number | null
  seasonId: number
  /** Época como o site a apresenta, ex.: "2026-2027". */
  seasonDescricao: string | null
  nome: string
  organizacao: string | null
  ativa: boolean
  nivelMinimo: NivelDelegado | null
  usaDelegadoCampo: boolean
}

export interface Jogo {
  id: number
  chaveNatural: string
  competicaoId: number
  fase: string | null
  serie: string | null
  jornada: string | null
  fpfFixtureId: number | null
  fpfMatchId: number | null
  dataHora: string | null // ISO local: YYYY-MM-DDTHH:mm
  clubeCasaId: number
  clubeForaId: number
  recintoId: number | null
  recintoTextoFpf: string | null
  estado: EstadoJogo
  importadoEm: string | null
  alteradoEm: string | null
}

/** Jogo com os nomes já resolvidos, para listagem na UI. */
export interface JogoDetalhado extends Jogo {
  competicaoNome: string
  clubeCasaNome: string
  clubeForaNome: string
  recintoNome: string | null
  recintoLat: number | null
  recintoLng: number | null
  nomeacoes: NomeacaoDetalhada[]
}

export interface Nomeacao {
  id: number
  jogoId: number
  delegadoId: number
  papel: PapelNomeacao
  km: number | null
  minutos: number | null
  fonteDistancia: FonteDistancia | null
  estado: EstadoNomeacao
  motivoOverride: string | null
  criadoEm: string
}

export interface NomeacaoDetalhada extends Nomeacao {
  delegadoNumero: string
  delegadoNome: string
  delegadoNivel: NivelDelegado
}

// ---------------------------------------------------------------------------
// Motor de sugestão
// ---------------------------------------------------------------------------

export type CodigoBloqueio =
  | 'INATIVO'
  | 'SEM_COORDENADAS'
  | 'INDISPONIVEL'
  | 'VETO_CLUBE'
  | 'CONFLITO_HORARIO'
  | 'NIVEL_INSUFICIENTE'
  | 'DISTANCIA_EXCESSIVA'
  | 'JA_NOMEADO'

export interface Bloqueio {
  codigo: CodigoBloqueio
  descricao: string
}

export interface ContributoComponente {
  /** Identificador do componente, ex.: 'equilibrioKm'. */
  componente: string
  /** Nome legível para a UI. */
  etiqueta: string
  /** Texto curto a mostrar no cartão. */
  detalhe: string
  /** Valor bruto do componente (km, contagens, ...). */
  valorBruto: number
  /** Valor normalizado 0..1, onde 1 é o melhor. */
  normalizado: number
  peso: number
  /** normalizado * peso */
  contributo: number
}

export interface Candidato {
  delegadoId: number
  numero: string
  nome: string
  nivel: NivelDelegado
  elegivel: boolean
  bloqueios: Bloqueio[]
  avisos: string[]
  /** 0..100 */
  score: number
  componentes: ContributoComponente[]
  /** Distância ida e volta, em km, entre a casa do delegado e o recinto. */
  kmViagem: number | null
  minutosViagem: number | null
  fonteDistancia: FonteDistancia | null
  /** Km acumulados na época (nomeações confirmadas). */
  kmEpoca: number
  /** Desvio face à média de km de todos os delegados ativos. */
  desvioKm: number
  /** Quantas vezes já fez jogos deste clube da casa nesta época. */
  vezesClubeCasa: number
  vezesClubeFora: number
  /** Nº de jogos já confirmados na época. */
  jogosEpoca: number
  lat: number | null
  lng: number | null
}

export interface PesoComponente {
  componente: string
  etiqueta: string
  descricao: string
  peso: number
  ativo: boolean
}

export interface ConfiguracaoMotor {
  pesos: PesoComponente[]
  /** Km (só ida) acima dos quais o delegado é bloqueado. 0 = sem limite. */
  distanciaMaximaKm: number
  /** Minutos de folga a exigir entre dois jogos do mesmo delegado. */
  margemEntreJogosMinutos: number
}

// ---------------------------------------------------------------------------
// Importação FPF
// ---------------------------------------------------------------------------

export interface EpocaFpf {
  seasonId: number
  descricao: string
  selecionada: boolean
}

export interface OrganizacaoFpf {
  nome: string
  competicoes: CompeticaoFpf[]
}

export interface CompeticaoFpf {
  competitionId: number
  nome: string
  modalidade: string | null
}

export interface JogoFpf {
  fixtureId: number
  matchId: number | null
  fase: string | null
  serie: string | null
  jornada: string | null
  clubeCasa: string
  clubeFora: string
  /** Texto cru da data tal como vem do site, ex.: "13 set". */
  dataTexto: string | null
  horaTexto: string | null
  /** Data resolvida para ISO com a época em conta. */
  dataHora: string | null
  recinto: string | null
  resultado: string | null
}

export type TipoAlteracaoJogo = 'NOVO' | 'ALTERADO' | 'INALTERADO'

export interface DiffJogo {
  tipo: TipoAlteracaoJogo
  chaveNatural: string
  competicaoNome: string
  clubeCasa: string
  clubeFora: string
  jornada: string | null
  dataHora: string | null
  recinto: string | null
  /** Campos alterados face ao que está em base de dados. */
  alteracoes: { campo: string; antes: string | null; depois: string | null }[]
  /** Verdadeiro quando o jogo alterado já tem nomeações. */
  temNomeacoes: boolean
  jogoId: number | null
}

export interface ResultadoSincronizacao {
  competicoes: {
    id: number
    nome: string
    jogos: number
    aviso: string | null
    /** Falso quando a estrutura não foi lida — nesse caso não se conclui nada. */
    lida: boolean
  }[]
  /** Jogos novos gravados automaticamente. */
  criados: number
  /** Jogos existentes atualizados automaticamente (sem nomeações em risco). */
  atualizados: number
  clubesCriados: string[]
  /**
   * Alterações já aplicadas que mexem em jogos com delegado nomeado — o que o
   * coordenador tem mesmo de saber.
   */
  sensiveis: DiffJogo[]
  erros: string[]
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export type TipoAlerta = 'ALTERADO' | 'DESAPARECIDO' | 'CONFLITO'

export interface Alerta {
  id: number
  /** Chave estável, para o mesmo facto não gerar alertas repetidos. */
  chave: string
  tipo: TipoAlerta
  jogoId: number | null
  competicao: string | null
  /** Ex.: "Sc Braga B × Cdc Montalegre". */
  descricao: string
  dataHora: string | null
  /** Texto já pronto a ler, com o que mudou e quem é afetado. */
  detalhe: string
  lido: boolean
  criadoEm: string
}

export interface ResultadoAtualizacao {
  /** Momento em que correu, ISO. */
  quando: string
  criados: number
  atualizados: number
  alertas: Alerta[]
  erros: string[]
}

export interface ProgressoSincronizacao {
  etapa: string
  atual: number
  total: number
  concluido: boolean
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface LinhaKmDelegado {
  delegadoId: number
  numero: string
  nome: string
  nivel: NivelDelegado
  jogos: number
  km: number
  desvio: number
  minutos: number
}

export interface MatrizDashboard {
  colunas: { chave: string; etiqueta: string }[]
  linhas: { delegadoId: number; numero: string; nome: string }[]
  celulas: { delegadoId: number; chaveColuna: string; valor: number }[]
}

export interface PropostaAutomatica {
  jogoId: number
  descricaoJogo: string
  dataHora: string | null
  principal: { delegadoId: number; nome: string; km: number | null } | null
  campo: { delegadoId: number; nome: string; km: number | null } | null
  motivo: string
}
