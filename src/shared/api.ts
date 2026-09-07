import type {
  Candidato,
  Clube,
  Competicao,
  ConfiguracaoMotor,
  Delegado,
  DiffJogo,
  EpocaFpf,
  Indisponibilidade,
  JogoDetalhado,
  LinhaKmDelegado,
  MatrizDashboard,
  OrganizacaoFpf,
  PapelNomeacao,
  ProgressoSincronizacao,
  PropostaAutomatica,
  Recinto,
  ResultadoSincronizacao,
  VetoClube
} from './tipos'

export interface FiltroJogosApi {
  de?: string
  ate?: string
  competicaoId?: number
  estadoNomeacao?: 'TODOS' | 'POR_NOMEAR' | 'PARCIAL' | 'COMPLETO'
  texto?: string
}

export interface RecintoDoClubeApi {
  id: number
  competicaoId: number | null
  competicaoNome: string | null
  recintoId: number
  recintoNome: string
}

export interface CatalogoFpf {
  epocas: EpocaFpf[]
  organizacoes: OrganizacaoFpf[]
  associacoes: { associationId: number; nome: string }[]
}

export interface PedidoSincronizacaoApi {
  seasonId: number
  descricaoEpoca: string
  organizacao: string
  competicoes: { competitionId: number; nome: string; nivelMinimo: string | null; usaDelegadoCampo: boolean }[]
  desde?: string
}

export interface InfoAplicacao {
  versao: string
  caminhoBaseDados: string
  pastaDados: string
  tilesUrl: string
}

export interface JogoManual {
  competicaoId: number
  clubeCasaId: number
  clubeForaId: number
  recintoId: number | null
  dataHora: string | null
  jornada: string | null
}

/** Superfície exposta ao renderer através do contextBridge. */
export interface Api {
  app: {
    info(): Promise<InfoAplicacao>
    abrirPastaDados(): Promise<void>
  }

  delegados: {
    listar(incluirInativos?: boolean): Promise<Delegado[]>
    guardar(delegado: Omit<Delegado, 'id'> & { id?: number }): Promise<Delegado>
    apagar(id: number): Promise<void>
    geocodificar(id: number): Promise<Delegado | null>
    indisponibilidades(delegadoId: number): Promise<Indisponibilidade[]>
    criarIndisponibilidade(dados: Omit<Indisponibilidade, 'id'>): Promise<Indisponibilidade[]>
    apagarIndisponibilidade(id: number, delegadoId: number): Promise<Indisponibilidade[]>
    vetos(delegadoId: number): Promise<VetoClube[]>
    criarVeto(dados: { delegadoId: number; clubeId: number; motivo: string | null }): Promise<VetoClube[]>
    apagarVeto(id: number, delegadoId: number): Promise<VetoClube[]>
  }

  clubes: {
    listar(): Promise<Clube[]>
    guardar(dados: { id?: number; nome: string; notas: string | null }): Promise<Clube[]>
    recintos(clubeId: number): Promise<RecintoDoClubeApi[]>
    definirRecinto(dados: {
      clubeId: number
      competicaoId: number | null
      recintoId: number
    }): Promise<RecintoDoClubeApi[]>
    apagarRecinto(id: number, clubeId: number): Promise<RecintoDoClubeApi[]>
  }

  recintos: {
    listar(): Promise<Recinto[]>
    guardar(dados: {
      id?: number
      nome: string
      morada: string | null
      lat: number | null
      lng: number | null
      coordsManuais: boolean
    }): Promise<Recinto[]>
    geocodificar(id: number): Promise<Recinto | null>
  }

  competicoes: {
    listar(seasonId?: number): Promise<Competicao[]>
    guardar(dados: Omit<Competicao, 'id'> & { id?: number }): Promise<Competicao[]>
    apagar(id: number): Promise<Competicao[]>
  }

  jogos: {
    listar(filtro?: FiltroJogosApi): Promise<JogoDetalhado[]>
    obter(id: number): Promise<JogoDetalhado | null>
    criarManual(dados: JogoManual): Promise<JogoDetalhado | null>
    apagar(id: number): Promise<void>
  }

  nomeacoes: {
    candidatos(jogoId: number, papel: PapelNomeacao): Promise<Candidato[]>
    nomear(dados: {
      jogoId: number
      delegadoId: number
      papel: PapelNomeacao
      motivoOverride?: string | null
    }): Promise<JogoDetalhado | null>
    remover(jogoId: number, papel: PapelNomeacao): Promise<JogoDetalhado | null>
    proposta(jogoIds: number[]): Promise<PropostaAutomatica[]>
    aplicarProposta(propostas: PropostaAutomatica[]): Promise<number>
  }

  dashboard: {
    km(seasonId?: number): Promise<LinhaKmDelegado[]>
    porCompeticao(seasonId?: number): Promise<MatrizDashboard>
    porClube(seasonId?: number): Promise<MatrizDashboard>
  }

  fpf: {
    catalogo(seasonId?: number): Promise<CatalogoFpf>
    competicoesDaAssociacao(associationId: number, seasonId: number): Promise<OrganizacaoFpf['competicoes']>
    sincronizar(pedido: PedidoSincronizacaoApi): Promise<ResultadoSincronizacao>
    aplicar(chaves: string[]): Promise<{ aplicados: number; ignorados: number }>
    aoProgredir(ouvinte: (p: ProgressoSincronizacao) => void): () => void
  }

  config: {
    motor(): Promise<ConfiguracaoMotor>
    guardarMotor(config: ConfiguracaoMotor): Promise<ConfiguracaoMotor>
    ler(chave: string): Promise<string | null>
    escrever(chave: string, valor: string): Promise<void>
  }
}

export type { DiffJogo }
