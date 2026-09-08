import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/api'
import type {
  Alerta,
  ProgressoGeocodificacao,
  ProgressoSincronizacao,
  ResultadoAtualizacao
} from '@shared/tipos'

const invocar =
  (canal: string) =>
  (...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(canal, ...args)

const api = {
  app: {
    info: invocar('app:info'),
    abrirPastaDados: invocar('app:abrirPastaDados')
  },
  delegados: {
    listar: invocar('delegados:listar'),
    guardar: invocar('delegados:guardar'),
    apagar: invocar('delegados:apagar'),
    geocodificar: invocar('delegados:geocodificar'),
    indisponibilidades: invocar('delegados:indisponibilidades'),
    criarIndisponibilidade: invocar('delegados:criarIndisponibilidade'),
    apagarIndisponibilidade: invocar('delegados:apagarIndisponibilidade'),
    vetos: invocar('delegados:vetos'),
    criarVeto: invocar('delegados:criarVeto'),
    apagarVeto: invocar('delegados:apagarVeto')
  },
  clubes: {
    listar: invocar('clubes:listar'),
    guardar: invocar('clubes:guardar'),
    recintos: invocar('clubes:recintos'),
    definirRecinto: invocar('clubes:definirRecinto'),
    apagarRecinto: invocar('clubes:apagarRecinto')
  },
  recintos: {
    listar: invocar('recintos:listar'),
    guardar: invocar('recintos:guardar'),
    geocodificar: invocar('recintos:geocodificar'),
    geocodificarEmFalta: invocar('recintos:geocodificarEmFalta'),
    procurar: invocar('recintos:procurar'),
    definirCoordenadas: invocar('recintos:definirCoordenadas'),
    confirmar: invocar('recintos:confirmar'),
    confirmarTodos: invocar('recintos:confirmarTodos'),
    aoProgredir: (ouvinte: (p: ProgressoGeocodificacao) => void): (() => void) => {
      const wrapper = (_e: unknown, p: ProgressoGeocodificacao): void => ouvinte(p)
      ipcRenderer.on('geo:progresso', wrapper)
      return () => ipcRenderer.removeListener('geo:progresso', wrapper)
    }
  },
  competicoes: {
    listar: invocar('competicoes:listar'),
    guardar: invocar('competicoes:guardar'),
    apagar: invocar('competicoes:apagar')
  },
  jogos: {
    listar: invocar('jogos:listar'),
    obter: invocar('jogos:obter'),
    criarManual: invocar('jogos:criarManual'),
    apagar: invocar('jogos:apagar'),
    importarCsv: invocar('jogos:importarCsv')
  },
  nomeacoes: {
    candidatos: invocar('nomeacoes:candidatos'),
    nomear: invocar('nomeacoes:nomear'),
    remover: invocar('nomeacoes:remover'),
    proposta: invocar('nomeacoes:proposta'),
    aplicarProposta: invocar('nomeacoes:aplicarProposta')
  },
  dashboard: {
    km: invocar('dashboard:km'),
    porCompeticao: invocar('dashboard:porCompeticao'),
    porClube: invocar('dashboard:porClube')
  },
  fpf: {
    catalogo: invocar('fpf:catalogo'),
    competicoesDaAssociacao: invocar('fpf:competicoesDaAssociacao'),
    sincronizar: invocar('fpf:sincronizar'),
    /** Subscreve o progresso da sincronização; devolve a função para cancelar. */
    aoProgredir: (ouvinte: (p: ProgressoSincronizacao) => void): (() => void) => {
      const wrapper = (_e: unknown, p: ProgressoSincronizacao): void => ouvinte(p)
      ipcRenderer.on('fpf:progresso', wrapper)
      return () => ipcRenderer.removeListener('fpf:progresso', wrapper)
    }
  },
  alertas: {
    listar: invocar('alertas:listar'),
    marcarLido: invocar('alertas:marcarLido'),
    marcarTodosLidos: invocar('alertas:marcarTodosLidos'),
    apagar: invocar('alertas:apagar'),
    aoChegar: (ouvinte: (alertas: Alerta[]) => void): (() => void) => {
      const wrapper = (_e: unknown, a: Alerta[]): void => ouvinte(a)
      ipcRenderer.on('alertas:novos', wrapper)
      return () => ipcRenderer.removeListener('alertas:novos', wrapper)
    }
  },
  sync: {
    estado: invocar('sync:estado'),
    agora: invocar('sync:agora'),
    aoConcluir: (ouvinte: (r: ResultadoAtualizacao) => void): (() => void) => {
      const wrapper = (_e: unknown, r: ResultadoAtualizacao): void => ouvinte(r)
      ipcRenderer.on('sync:concluida', wrapper)
      return () => ipcRenderer.removeListener('sync:concluida', wrapper)
    }
  },
  config: {
    motor: invocar('config:motor'),
    guardarMotor: invocar('config:guardarMotor'),
    ler: invocar('config:ler'),
    escrever: invocar('config:escrever')
  }
} as unknown as Api

contextBridge.exposeInMainWorld('api', api)
