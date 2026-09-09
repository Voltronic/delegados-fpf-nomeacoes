import type {
  Alerta,
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
  LinhaRepeticoes,
  MatrizDashboard,
  OrganizacaoFpf,
  PapelNomeacao,
  ProgressoGeocodificacao,
  ProgressoSincronizacao,
  PropostaAutomatica,
  Recinto,
  ResultadoAtualizacao,
  ResultadoGeocodificacaoLote,
  ResultadoPropostaAutomatica,
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
  pastaCopias: string
  /** Versão do esquema desta base de dados e a que o executável conhece. */
  versaoEsquema: number
  versaoEsquemaConhecida: number
  tilesUrl: string
}

export interface ResultadoImportacaoDelegadosApi {
  criados: number
  atualizados: number
  vetosSemClube: string[]
}

export interface CopiaSegurancaApi {
  ficheiro: string
  caminho: string
  bytes: number
  criadaEm: string
}

export interface ResultadoImportacaoCsvApi {
  criados: number
  atualizados: number
  competicoesCriadas: string[]
  clubesCriados: string[]
  erros: { linha: number; mensagem: string }[]
  colunasIgnoradas: string[]
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
    /** Cópias de segurança existentes, da mais recente para a mais antiga. */
    copias(): Promise<CopiaSegurancaApi[]>
    /** Cópia imediata, além da que é feita em cada arranque. */
    criarCopia(): Promise<CopiaSegurancaApi[]>
    abrirPastaCopias(): Promise<void>
  }

  geo: {
    /** Procura um local por texto livre ou por link do Google Maps colado. */
    procurar(termo: string): Promise<{ lat: number; lng: number; moradaResolvida: string; categoria: string }[]>
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
    /** Conteúdo do ficheiro de delegados, para guardar fora da aplicação. */
    exportar(): Promise<string>
    /** Repõe delegados de um ficheiro exportado; nunca apaga os que faltarem. */
    importar(conteudo: string): Promise<ResultadoImportacaoDelegadosApi>
    /** Abre a janela de gravação e devolve o caminho escolhido (ou `null`). */
    gravarFicheiro(): Promise<string | null>
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
    /** Localiza de uma vez todos os recintos sem coordenadas. */
    geocodificarEmFalta(): Promise<ResultadoGeocodificacaoLote>
    /** Procura um local por texto livre, para o coordenador escolher. */
    procurar(termo: string): Promise<{ lat: number; lng: number; moradaResolvida: string; categoria: string }[]>
    definirCoordenadas(id: number, lat: number, lng: number, descricao: string): Promise<Recinto[]>
    confirmar(id: number, confirmado: boolean): Promise<Recinto[]>
    confirmarTodos(): Promise<Recinto[]>
    aoProgredir(ouvinte: (p: ProgressoGeocodificacao) => void): () => void
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
    /** Importa jogos de um ficheiro CSV — o recurso que não depende do site. */
    importarCsv(texto: string, seasonId: number, descricaoEpoca: string): Promise<ResultadoImportacaoCsvApi>
    /** Tira (ou repõe) um jogo das listas de trabalho, sem apagar nada. */
    esconder(id: number, escondido: boolean): Promise<JogoDetalhado | null>
    /** Jogos escondidos que ainda estão para acontecer. */
    escondidos(): Promise<JogoDetalhado[]>
    /** Jogos já realizados que tiveram delegado nomeado. */
    historico(filtro?: FiltroJogosApi): Promise<JogoDetalhado[]>
  }

  nomeacoes: {
    candidatos(jogoId: number, papel: PapelNomeacao): Promise<Candidato[]>
    /** Quantas nomeações existem — para avisar antes de as apagar. */
    contar(): Promise<number>
    /**
     * Apaga **todas** as nomeações, depois de gravar uma cópia de segurança.
     * Devolve quantas apagou e o caminho da cópia.
     */
    apagarTodas(): Promise<{ apagadas: number; copia: string | null }>
    nomear(dados: {
      jogoId: number
      delegadoId: number
      papel: PapelNomeacao
      motivoOverride?: string | null
    }): Promise<JogoDetalhado | null>
    remover(jogoId: number, papel: PapelNomeacao): Promise<JogoDetalhado | null>
    proposta(jogoIds: number[]): Promise<ResultadoPropostaAutomatica>
    aplicarProposta(propostas: PropostaAutomatica[]): Promise<number>
  }

  dashboard: {
    km(seasonId?: number): Promise<LinhaKmDelegado[]>
    porCompeticao(seasonId?: number): Promise<MatrizDashboard>
    /** Pares clube/competição que cada delegado repetiu (2 ou mais vezes). */
    repeticoesClube(seasonId?: number): Promise<LinhaRepeticoes[]>
  }

  fpf: {
    catalogo(seasonId?: number): Promise<CatalogoFpf>
    competicoesDaAssociacao(associationId: number, seasonId: number): Promise<OrganizacaoFpf['competicoes']>
    sincronizar(pedido: PedidoSincronizacaoApi): Promise<ResultadoSincronizacao>
    aoProgredir(ouvinte: (p: ProgressoSincronizacao) => void): () => void
  }

  alertas: {
    listar(apenasPorLer?: boolean): Promise<Alerta[]>
    marcarLido(id: number, lido: boolean): Promise<Alerta[]>
    marcarTodosLidos(): Promise<Alerta[]>
    apagar(id: number): Promise<Alerta[]>
    /** Alertas novos vindos da atualização automática. */
    aoChegar(ouvinte: (alertas: Alerta[]) => void): () => void
  }

  sync: {
    estado(): Promise<{ aCorrer: boolean; ultima: ResultadoAtualizacao | null }>
    agora(): Promise<ResultadoAtualizacao>
    aoConcluir(ouvinte: (r: ResultadoAtualizacao) => void): () => void
  }

  config: {
    motor(): Promise<ConfiguracaoMotor>
    guardarMotor(config: ConfiguracaoMotor): Promise<ConfiguracaoMotor>
    ler(chave: string): Promise<string | null>
    escrever(chave: string, valor: string): Promise<void>
  }
}

export type { DiffJogo }
