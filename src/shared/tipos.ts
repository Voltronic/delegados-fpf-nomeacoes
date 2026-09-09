/** Tipos de domínio partilhados entre o processo main e o renderer. */

export type NivelDelegado = 'ELITE' | 'PRINCIPAL'
export type PapelNomeacao = 'PRINCIPAL' | 'CAMPO'
export type EstadoNomeacao = 'SUGERIDA' | 'CONFIRMADA' | 'CANCELADA'
export type FonteDistancia = 'OSRM' | 'HAVERSINE' | 'MANUAL' | 'AVIAO'
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

export type OrigemCoordenadas =
  | 'MORADA'
  | 'NOME'
  | 'NOME_SIMPLIFICADO'
  | 'CLUBE'
  | 'CLUBE_SIMPLIFICADO'
  | 'MANUAL'

export interface Recinto {
  id: number
  nome: string
  morada: string | null
  lat: number | null
  lng: number | null
  coordsManuais: boolean
  geocodificadoEm: string | null
  /** Como as coordenadas foram obtidas — ver `confirmado`. */
  origemCoords: OrigemCoordenadas | null
  /** Quão de confiança é o ponto: ALTA quando várias pesquisas concordaram. */
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA' | null
  /** O que o serviço devolveu, para se poder conferir a olho. */
  moradaResolvida: string | null
  /** Verdadeiro depois de alguém confirmar que o ponto está certo. */
  confirmado: boolean
  /** Clubes que jogam neste recinto, para dar contexto na revisão. */
  clubes?: string[]
}

export interface ProgressoGeocodificacao {
  atual: number
  total: number
  recinto: string
  concluido: boolean
}

export interface ResultadoGeocodificacaoLote {
  localizados: number
  /** Quantos vieram da lista de correções confirmadas, sem pesquisa. */
  corrigidos: number
  porConfirmar: number
  /** Quantos ficaram em cada nível de confiança. */
  porConfianca: { alta: number; media: number; baixa: number }
  falhados: { id: number; nome: string; clubes: string[] }[]
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
  /** Retirado da lista pelo coordenador; recuperável no ecrã Escondidos. */
  escondido: boolean
  escondidoEm: string | null
  /** Corrigido à mão: a sincronização deixa de lhe tocar. */
  editadoManualmente: boolean
  editadoEm: string | null
  /** O que mudou da última vez, pronto a mostrar. Ex.: "hora 15:00 → 17:00". */
  ultimaAlteracao: string | null
}

/** Campos que o coordenador pode corrigir à mão num jogo. */
export interface EdicaoJogo {
  dataHora: string | null
  recintoId: number | null
  jornada: string | null
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

export type TipoAlerta = 'ALTERADO' | 'DESAPARECIDO' | 'CONFLITO' | 'RECINTO_SEM_COORDENADAS'

export interface Alerta {
  id: number
  /** Chave estável, para o mesmo facto não gerar alertas repetidos. */
  chave: string
  tipo: TipoAlerta
  jogoId: number | null
  /** Preenchido nos alertas de recinto sem coordenadas. */
  recintoId: number | null
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
  /** Recintos novos que ficaram com ponto no mapa nesta atualização. */
  recintosLocalizados: number
  /** Recintos que continuam sem coordenadas e precisam de mão humana. */
  recintosPorLocalizar: number
  /** Recintos localizados automaticamente, à espera de confirmação visual. */
  recintosPorConfirmar: number
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
  /** Deslocações que obrigaram a avião — o que custa caro à FPF. */
  voos: number
  km: number
  desvio: number
  minutos: number
}

/**
 * Repetições de um par clube/competição por delegado.
 *
 * Fazer o mesmo clube em competições diferentes não é repetir — são jogos
 * distintos, com equipas e escalões diferentes —, por isso a contagem é feita
 * pelo par e não só pelo clube.
 */
export interface RepeticaoClube {
  clubeId: number
  clubeNome: string
  competicaoId: number
  competicaoNome: string
  /** Sempre >= 2: uma única visita não é repetição. */
  vezes: number
}

export interface LinhaRepeticoes {
  delegadoId: number
  numero: string
  nome: string
  repeticoes: RepeticaoClube[]
}

export interface MatrizDashboard {
  colunas: { chave: string; etiqueta: string }[]
  linhas: { delegadoId: number; numero: string; nome: string }[]
  celulas: { delegadoId: number; chaveColuna: string; valor: number }[]
}

export interface JogoSemProposta {
  jogoId: number
  descricaoJogo: string
  dataHora: string | null
  /** Porque nenhum delegado servia, já contado (ex.: "3 já com outro jogo à mesma hora"). */
  motivos: string[]
}

export interface ResultadoPropostaAutomatica {
  propostas: PropostaAutomatica[]
  /** Jogos para os quais não houve ninguém elegível, com o motivo. */
  semSugestao: JogoSemProposta[]
  /** Jogos que já tinham os delegados todos e por isso nem foram considerados. */
  jaCompletos: number
}

export interface PropostaAutomatica {
  jogoId: number
  descricaoJogo: string
  dataHora: string | null
  principal: { delegadoId: number; nome: string; km: number | null } | null
  campo: { delegadoId: number; nome: string; km: number | null } | null
  motivo: string
}
