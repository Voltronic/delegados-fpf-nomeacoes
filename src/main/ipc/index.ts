import { BrowserWindow, ipcMain, shell } from 'electron'
import { dirname } from 'node:path'
import type {
  CatalogoFpf,
  FiltroJogosApi,
  InfoAplicacao,
  JogoManual,
  PedidoSincronizacaoApi,
  RecintoDoClubeApi
} from '@shared/api'
import type {
  Competicao,
  ConfiguracaoMotor,
  Delegado,
  Indisponibilidade,
  PapelNomeacao,
  ProgressoSincronizacao,
  PropostaAutomatica
} from '@shared/tipos'
import { escreverConfig, lerConfig } from '../db'
import * as repos from '../db/repos'
import { ClienteFpf } from '../fpf/cliente'
import {
  aplicarSincronizacao,
  competicoesDaAssociacao,
  obterCatalogo,
  sincronizar
} from '../fpf/sincronizacao'
import { chaveNatural } from '../fpf/parsers'
import { geocodificar, invalidarCache } from '../geo'
import {
  aplicarProposta,
  candidatosParaJogo,
  guardarConfiguracaoMotor,
  nomear,
  obterConfiguracaoMotor,
  propostaAutomatica
} from '../engine/servico'

let clienteFpf: ClienteFpf | null = null
let baseAtual = ''

/** Reutiliza o mesmo cliente: guarda a fila de pedidos e a janela de recurso. */
function cliente(): ClienteFpf {
  const base = lerConfig('fpf.baseUrl') ?? 'https://resultados.fpf.pt'
  if (!clienteFpf || baseAtual !== base) {
    clienteFpf?.fechar()
    clienteFpf = new ClienteFpf({ baseUrl: base })
    baseAtual = base
  }
  return clienteFpf
}

export function fecharCliente(): void {
  clienteFpf?.fechar()
  clienteFpf = null
}

export function registarIpc(contexto: { versao: string; caminhoBaseDados: string }): void {
  const registar = <T extends unknown[], R>(canal: string, manipulador: (...args: T) => R | Promise<R>): void => {
    ipcMain.handle(canal, async (_evento, ...args) => manipulador(...(args as T)))
  }

  // -- Aplicação ------------------------------------------------------------
  registar('app:info', (): InfoAplicacao => ({
    versao: contexto.versao,
    caminhoBaseDados: contexto.caminhoBaseDados,
    pastaDados: dirname(contexto.caminhoBaseDados),
    tilesUrl: lerConfig('mapa.tilesUrl') ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  }))
  registar('app:abrirPastaDados', async () => {
    await shell.openPath(dirname(contexto.caminhoBaseDados))
  })

  // -- Delegados ------------------------------------------------------------
  registar('delegados:listar', (incluirInativos?: boolean) => repos.listarDelegados(incluirInativos ?? true))

  registar('delegados:guardar', (dados: Omit<Delegado, 'id'> & { id?: number }) => {
    const anterior = dados.id ? repos.obterDelegado(dados.id) : null
    const guardado = dados.id ? repos.atualizarDelegado(dados.id, dados) : repos.criarDelegado(dados)
    // Mudar a morada invalida as distâncias em cache desse delegado.
    if (anterior && (anterior.lat !== guardado.lat || anterior.lng !== guardado.lng)) {
      invalidarCache({ delegadoId: guardado.id })
    }
    return guardado
  })

  registar('delegados:apagar', (id: number) => repos.apagarDelegado(id))

  registar('delegados:geocodificar', async (id: number) => {
    const delegado = repos.obterDelegado(id)
    if (!delegado?.morada) return null
    const resultado = await geocodificar(delegado.morada)
    if (!resultado) return null
    const atualizado = repos.atualizarDelegado(id, {
      ...delegado,
      lat: resultado.lat,
      lng: resultado.lng,
      coordsManuais: false
    })
    invalidarCache({ delegadoId: id })
    return atualizado
  })

  registar('delegados:indisponibilidades', (delegadoId: number) => repos.listarIndisponibilidades(delegadoId))
  registar('delegados:criarIndisponibilidade', (dados: Omit<Indisponibilidade, 'id'>) => {
    repos.criarIndisponibilidade(dados)
    return repos.listarIndisponibilidades(dados.delegadoId)
  })
  registar('delegados:apagarIndisponibilidade', (id: number, delegadoId: number) => {
    repos.apagarIndisponibilidade(id)
    return repos.listarIndisponibilidades(delegadoId)
  })

  registar('delegados:vetos', (delegadoId: number) => repos.listarVetos(delegadoId))
  registar('delegados:criarVeto', (dados: { delegadoId: number; clubeId: number; motivo: string | null }) => {
    repos.criarVeto(dados)
    return repos.listarVetos(dados.delegadoId)
  })
  registar('delegados:apagarVeto', (id: number, delegadoId: number) => {
    repos.apagarVeto(id)
    return repos.listarVetos(delegadoId)
  })

  // -- Clubes e recintos ----------------------------------------------------
  registar('clubes:listar', () => repos.listarClubes())
  registar('clubes:guardar', (dados: { id?: number; nome: string; notas: string | null }) => {
    if (dados.id) repos.atualizarClube(dados.id, dados.nome, dados.notas)
    else repos.encontrarOuCriarClube(dados.nome)
    return repos.listarClubes()
  })
  registar('clubes:recintos', (clubeId: number): RecintoDoClubeApi[] => repos.listarRecintosDoClube(clubeId))
  registar(
    'clubes:definirRecinto',
    (dados: { clubeId: number; competicaoId: number | null; recintoId: number }) => {
      repos.definirRecintoDoClube(dados.clubeId, dados.competicaoId, dados.recintoId)
      return repos.listarRecintosDoClube(dados.clubeId)
    }
  )
  registar('clubes:apagarRecinto', (id: number, clubeId: number) => {
    repos.apagarRecintoDoClube(id)
    return repos.listarRecintosDoClube(clubeId)
  })

  registar('recintos:listar', () => repos.listarRecintos())
  registar(
    'recintos:guardar',
    (dados: {
      id?: number
      nome: string
      morada: string | null
      lat: number | null
      lng: number | null
      coordsManuais: boolean
    }) => {
      if (dados.id) {
        repos.atualizarRecinto(dados.id, dados)
        invalidarCache({ recintoId: dados.id })
      } else {
        const criado = repos.encontrarOuCriarRecinto(dados.nome)
        repos.atualizarRecinto(criado.id, dados)
      }
      return repos.listarRecintos()
    }
  )
  registar('recintos:geocodificar', async (id: number) => {
    const recinto = repos.obterRecinto(id)
    if (!recinto) return null
    // Sem morada, procura-se pelo nome do recinto, que costuma bastar em Portugal.
    const resultado = await geocodificar(recinto.morada || `${recinto.nome}, Portugal`)
    if (!resultado) return null
    const atualizado = repos.atualizarRecinto(id, {
      nome: recinto.nome,
      morada: recinto.morada ?? resultado.moradaResolvida,
      lat: resultado.lat,
      lng: resultado.lng,
      coordsManuais: false
    })
    invalidarCache({ recintoId: id })
    return atualizado
  })

  // -- Competições ----------------------------------------------------------
  registar('competicoes:listar', (seasonId?: number) => repos.listarCompeticoes(seasonId))
  registar('competicoes:guardar', (dados: Omit<Competicao, 'id'> & { id?: number }) => {
    repos.guardarCompeticao(dados)
    return repos.listarCompeticoes()
  })
  registar('competicoes:apagar', (id: number) => {
    repos.apagarCompeticao(id)
    return repos.listarCompeticoes()
  })

  // -- Jogos ----------------------------------------------------------------
  registar('jogos:listar', (filtro?: FiltroJogosApi) => repos.listarJogos(filtro ?? {}))
  registar('jogos:obter', (id: number) => repos.obterJogoDetalhado(id))
  registar('jogos:criarManual', (dados: JogoManual) => {
    const clubes = repos.listarClubes()
    const casa = clubes.find((c) => c.id === dados.clubeCasaId)
    const fora = clubes.find((c) => c.id === dados.clubeForaId)
    if (!casa || !fora) return null
    const chave = `${chaveNatural(dados.competicaoId, 0, casa.nome, fora.nome)}:${dados.dataHora ?? 'sd'}`
    const id = repos.guardarJogo({
      chaveNatural: chave,
      competicaoId: dados.competicaoId,
      fase: null,
      serie: null,
      jornada: dados.jornada,
      fpfFixtureId: null,
      fpfMatchId: null,
      dataHora: dados.dataHora,
      clubeCasaId: dados.clubeCasaId,
      clubeForaId: dados.clubeForaId,
      recintoId: dados.recintoId ?? repos.recintoDoClube(dados.clubeCasaId, dados.competicaoId),
      recintoTextoFpf: null,
      estado: 'AGENDADO'
    })
    return repos.obterJogoDetalhado(id)
  })
  registar('jogos:apagar', (id: number) => repos.apagarJogo(id))

  // -- Nomeações ------------------------------------------------------------
  registar('nomeacoes:candidatos', (jogoId: number, papel: PapelNomeacao) =>
    candidatosParaJogo(jogoId, papel)
  )
  registar(
    'nomeacoes:nomear',
    (dados: { jogoId: number; delegadoId: number; papel: PapelNomeacao; motivoOverride?: string | null }) =>
      nomear(dados)
  )
  registar('nomeacoes:remover', (jogoId: number, papel: PapelNomeacao) => {
    repos.removerNomeacao(jogoId, papel)
    return repos.obterJogoDetalhado(jogoId)
  })
  registar('nomeacoes:proposta', (jogoIds: number[]) => propostaAutomatica(jogoIds))
  registar('nomeacoes:aplicarProposta', (propostas: PropostaAutomatica[]) => aplicarProposta(propostas))

  // -- Dashboard ------------------------------------------------------------
  registar('dashboard:km', (seasonId?: number) => repos.tabelaKm(seasonId))
  registar('dashboard:porCompeticao', (seasonId?: number) => repos.matrizPorCompeticao(seasonId))
  registar('dashboard:porClube', (seasonId?: number) => repos.matrizPorClube(seasonId))

  // -- Importação FPF -------------------------------------------------------
  registar('fpf:catalogo', async (seasonId?: number): Promise<CatalogoFpf> => obterCatalogo(cliente(), seasonId))
  registar('fpf:competicoesDaAssociacao', (associationId: number, seasonId: number) =>
    competicoesDaAssociacao(cliente(), associationId, seasonId)
  )
  registar('fpf:sincronizar', async (pedido: PedidoSincronizacaoApi) => {
    const emitir = (p: ProgressoSincronizacao): void => {
      for (const janela of BrowserWindow.getAllWindows()) janela.webContents.send('fpf:progresso', p)
    }
    return sincronizar(cliente(), pedido, emitir)
  })
  registar('fpf:aplicar', (chaves: string[]) => aplicarSincronizacao(chaves))

  // -- Configuração ---------------------------------------------------------
  registar('config:motor', () => obterConfiguracaoMotor())
  registar('config:guardarMotor', (config: ConfiguracaoMotor) => guardarConfiguracaoMotor(config))
  registar('config:ler', (chave: string) => lerConfig(chave))
  registar('config:escrever', (chave: string, valor: string) => escreverConfig(chave, valor))
}
