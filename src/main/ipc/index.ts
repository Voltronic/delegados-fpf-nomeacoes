import { BrowserWindow, dialog, ipcMain, powerSaveBlocker, shell } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
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
  EdicaoJogo,
  Indisponibilidade,
  PapelNomeacao,
  ProgressoSincronizacao,
  PropostaAutomatica
} from '@shared/tipos'
import { etiquetaDoPapel } from '@shared/tipos'
import {
  copiaSeguranca,
  emTransacao,
  escreverConfig,
  lerConfig,
  listarCopiasSeguranca,
  obterBaseDados,
  PASTA_COPIAS,
  reporCopiaSeguranca,
  versaoConhecida,
  versaoDoEsquema
} from '../db'
import * as repos from '../db/repos'
import { ClienteFpf } from '../fpf/cliente'
import {
  competicoesDaAssociacao,
  importarCsv,
  obterCatalogo,
  sincronizar
} from '../fpf/sincronizacao'
import { exportarDelegados, importarDelegados } from '../delegados/servico'
import {
  desfazerUltimaAccao,
  esquecerUltimaAccao,
  registarAlteracao,
  ultimaAccao
} from '../engine/desfazer'
import { chaveNatural } from '../fpf/parsers'
import { geocodificar, invalidarCache, obterTrajeto } from '../geo'
import { geocodificarRecintosEmFalta } from '../geo/lote'
import { extrairCoordenadas } from '../geo/googlemaps'
import { atualizarJogos, cancelarNovaTentativa, depoisDeAtualizar, estadoAtualizacao } from '../sync/agendador'
import { descreverQuando, folgaDe } from '../sync/conflitos'
import {
  aplicarProposta,
  candidatosParaJogo,
  guardarConfiguracaoMotor,
  nomear,
  obterConfiguracaoMotor,
  propostaAutomatica,
  type OpcoesProposta
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

/** O mesmo cliente usado pelo IPC, para o agendador partilhar fila e sessão. */
export const clienteFpfPartilhado = (): ClienteFpf => cliente()

export function fecharCliente(): void {
  clienteFpf?.fechar()
  clienteFpf = null
}

/** Faz chegar alertas novos à janela, como faz a atualização automática. */
function emitirAlertas(alertas: unknown[]): void {
  for (const janela of BrowserWindow.getAllWindows()) {
    if (!janela.isDestroyed()) janela.webContents.send('alertas:novos', alertas)
  }
}

let janelaDoMapa: BrowserWindow | null = null
let ultimoEstadoDoMapa: unknown = null

/**
 * Depois de um gesto que marca um jogo para um recinto — trazê-lo para a lista,
 * corrigi-lo à mão —, avisa logo se esse recinto não tem coordenadas, em vez de
 * esperar pela atualização seguinte.
 */
function avisarSobreRecintos(): void {
  repos.apagarAlertasDeRecintosLocalizados()
  repos.apagarAlertasDeRecintosConfirmados()
  const novos = [
    ...repos.criarAlertas(repos.alertasDeRecintosSemCoordenadas()),
    ...repos.criarAlertas(repos.alertasDeRecintosPorConfirmar())
  ]
  if (novos.length) emitirAlertas(novos)
}

export function registarIpc(contexto: {
  versao: string
  caminhoBaseDados: string
  pastaCopias?: string
  /** Ficheiros da interface, para abrir a janela do mapa. */
  preload: string
  paginaRenderer: string
}): void {
  const registar = <T extends unknown[], R>(canal: string, manipulador: (...args: T) => R | Promise<R>): void => {
    ipcMain.handle(canal, async (_evento, ...args) => manipulador(...(args as T)))
  }

  // -- Aplicação ------------------------------------------------------------
  registar('app:info', (): InfoAplicacao => ({
    versao: contexto.versao,
    caminhoBaseDados: contexto.caminhoBaseDados,
    pastaDados: dirname(contexto.caminhoBaseDados),
    pastaCopias: contexto.pastaCopias ?? PASTA_COPIAS,
    versaoEsquema: versaoDoEsquema(obterBaseDados()),
    versaoEsquemaConhecida: versaoConhecida(),
    tilesUrl: lerConfig('mapa.tilesUrl') ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  }))
  registar('app:abrirPastaDados', async () => {
    await shell.openPath(dirname(contexto.caminhoBaseDados))
  })
  registar('app:copias', () => listarCopiasSeguranca(contexto.pastaCopias ?? PASTA_COPIAS))
  /**
   * Repõe uma cópia de segurança. O renderer recarrega a seguir, porque todos os
   * ecrãs têm dados em memória vindos da base de dados que acabou de ser trocada.
   */
  registar('app:reporCopia', (caminho: string) => {
    reporCopiaSeguranca(caminho, contexto.caminhoBaseDados, contexto.pastaCopias ?? PASTA_COPIAS)
    return listarCopiasSeguranca(contexto.pastaCopias ?? PASTA_COPIAS)
  })

  registar('app:criarCopia', () => {
    const destino = copiaSeguranca(obterBaseDados(), contexto.pastaCopias ?? PASTA_COPIAS)
    if (!destino) throw new Error('Não foi possível criar a cópia de segurança.')
    return listarCopiasSeguranca(contexto.pastaCopias ?? PASTA_COPIAS)
  })
  registar('app:abrirPastaCopias', async () => {
    const pasta = contexto.pastaCopias ?? PASTA_COPIAS
    mkdirSync(pasta, { recursive: true })
    await shell.openPath(pasta)
  })

  registar('nomeacoes:contar', () => repos.contarNomeacoes())
  /**
   * Apaga todas as nomeações. Grava sempre uma cópia de segurança primeiro: é
   * uma operação sem retorno, e a cópia é a única forma de voltar atrás.
   */
  registar('nomeacoes:apagarTodas', (): { apagadas: number; copia: string | null } => {
    const copia = copiaSeguranca(obterBaseDados(), contexto.pastaCopias ?? PASTA_COPIAS)
    esquecerUltimaAccao()
    const apagadas = emTransacao(() => repos.apagarTodasNomeacoes())
    return { apagadas, copia }
  })

  /** Traçado da viagem de um delegado até ao recinto, para desenhar no mapa. */
  registar('geo:trajeto', async (delegadoId: number, recintoId: number) => {
    const delegado = repos.obterDelegado(delegadoId)
    const recinto = repos.obterRecinto(recintoId)
    if (delegado?.lat == null || delegado.lng == null || recinto?.lat == null || recinto.lng == null) {
      return null
    }
    return obterTrajeto(
      { lat: delegado.lat, lng: delegado.lng },
      { lat: recinto.lat, lng: recinto.lng }
    )
  })

  // -- Mapa em janela à parte -----------------------------------------------
  //
  // Com dezenas de delegados, o mapa e a lista disputam o mesmo ecrã. Numa
  // janela própria, o mapa pode ir para um segundo monitor e a lista fica com
  // a largura toda. O estado continua a vir do ecrã principal: a janela do
  // mapa não sabe nada sozinha, só desenha o que recebe.
  registar('mapa:destacar', () => {
    if (janelaDoMapa && !janelaDoMapa.isDestroyed()) {
      janelaDoMapa.focus()
      return true
    }
    janelaDoMapa = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Mapa — Nomeações de Delegados',
      backgroundColor: '#f5f6f8',
      webPreferences: {
        preload: contexto.preload,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    // A página da janela ainda está a carregar quando o ecrã principal manda o
    // primeiro estado, e essa mensagem perdia-se — a janela abria vazia. O
    // último estado fica guardado e é entregue assim que a página está pronta.
    janelaDoMapa.webContents.on('did-finish-load', () => {
      if (ultimoEstadoDoMapa !== null && janelaDoMapa && !janelaDoMapa.isDestroyed()) {
        janelaDoMapa.webContents.send('mapa:estado', ultimoEstadoDoMapa)
      }
    })
    void janelaDoMapa.loadFile(contexto.paginaRenderer, { hash: 'mapa' })
    janelaDoMapa.on('closed', () => {
      janelaDoMapa = null
      // O ecrã principal volta a mostrar o mapa onde estava.
      for (const janela of BrowserWindow.getAllWindows()) {
        if (!janela.isDestroyed()) janela.webContents.send('mapa:juntou')
      }
    })
    return true
  })

  registar('mapa:juntar', () => {
    janelaDoMapa?.close()
    return true
  })

  /** O ecrã principal manda o que há para desenhar; a janela do mapa recebe. */
  /**
   * A janela do mapa pede o estado quando monta. Empurrá-lo assim que a página
   * carrega não chegava: o React ainda não tinha posto o ouvinte, e a mensagem
   * caía no vazio. Pedir é a única ordem que não depende de tempos.
   */
  registar('mapa:estadoAtual', () => ultimoEstadoDoMapa)

  registar('mapa:estado', (estado: unknown) => {
    ultimoEstadoDoMapa = estado
    if (janelaDoMapa && !janelaDoMapa.isDestroyed()) janelaDoMapa.webContents.send('mapa:estado', estado)
  })

  /** Clicar num pino na janela do mapa realça o candidato no ecrã principal. */
  registar('mapa:realcar', (delegadoId: number | null) => {
    for (const janela of BrowserWindow.getAllWindows()) {
      if (janela !== janelaDoMapa && !janela.isDestroyed()) {
        janela.webContents.send('mapa:realcar', delegadoId)
      }
    }
  })

  // -- Delegados ------------------------------------------------------------
  registar('delegados:listar', (incluirInativos?: boolean, incluirArquivados?: boolean) =>
    repos.listarDelegados(incluirInativos, incluirArquivados)
  )

  registar('delegados:guardar', (dados: Omit<Delegado, 'id'> & { id?: number }) => {
    const anterior = dados.id ? repos.obterDelegado(dados.id) : null
    const guardado = dados.id ? repos.atualizarDelegado(dados.id, dados) : repos.criarDelegado(dados)
    // Mudar a morada invalida as distâncias em cache desse delegado.
    if (anterior && (anterior.lat !== guardado.lat || anterior.lng !== guardado.lng)) {
      invalidarCache({ delegadoId: guardado.id })
    }
    return guardado
  })

  // Arquivar, não apagar: as nomeações das épocas passadas são o histórico.
  registar('delegados:apagar', (id: number) => repos.apagarDelegado(id))
  registar('delegados:restaurar', (id: number) => repos.restaurarDelegado(id))

  registar('delegados:exportar', () => exportarDelegados())
  registar('delegados:importar', (conteudo: string) => importarDelegados(conteudo))
  /** Grava a exportação num ficheiro à escolha do utilizador. */
  registar('delegados:gravarFicheiro', async (): Promise<string | null> => {
    const conteudo = exportarDelegados()
    const hoje = new Date().toISOString().slice(0, 10)
    const escolha = await dialog.showSaveDialog({
      title: 'Guardar delegados',
      defaultPath: `delegados-${hoje}.json`,
      filters: [{ name: 'Delegados (JSON)', extensions: ['json'] }]
    })
    if (escolha.canceled || !escolha.filePath) return null
    writeFileSync(escolha.filePath, conteudo, 'utf8')
    return escolha.filePath
  })

  registar('delegados:geocodificar', async (id: number) => {
    const delegado = repos.obterDelegado(id)
    if (!delegado?.morada) return null
    const resultado = await geocodificar(delegado.morada, true)
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
    const resultado = await geocodificar(recinto.morada || `${recinto.nome}, Portugal`, true)
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

  registar('recintos:geocodificarEmFalta', async () => {
    const bloqueio = powerSaveBlocker.start('prevent-app-suspension')
    try {
      return await geocodificarRecintosEmFalta((p) => {
        for (const janela of BrowserWindow.getAllWindows()) janela.webContents.send('geo:progresso', p)
      })
    } finally {
      if (powerSaveBlocker.isStarted(bloqueio)) powerSaveBlocker.stop(bloqueio)
    }
  })
  // Pesquisa de um local por texto livre ou link do Google Maps, usada tanto
  // pelos recintos como pela morada dos delegados.
  registar('geo:procurar', async (termo: string) => {
    const coladas = extrairCoordenadas(termo)
    if (coladas) {
      return [
        {
          lat: coladas.lat,
          lng: coladas.lng,
          moradaResolvida: `Coordenadas do link (${coladas.lat.toFixed(5)}, ${coladas.lng.toFixed(5)})`,
          categoria: `colado/${coladas.fonte}`
        }
      ]
    }
    const r = await geocodificar(termo, true)
    return r ? [r] : []
  })

  registar('recintos:procurar', async (termo: string) => {
    // Um link do Google Maps colado é a forma mais rápida de resolver um
    // recinto que a pesquisa não acerta — lê-se sem contactar ninguém.
    const coladas = extrairCoordenadas(termo)
    if (coladas) {
      return [
        {
          lat: coladas.lat,
          lng: coladas.lng,
          moradaResolvida: `Coordenadas do link (${coladas.lat.toFixed(5)}, ${coladas.lng.toFixed(5)})`,
          categoria: `colado/${coladas.fonte}`
        }
      ]
    }
    const r = await geocodificar(termo, true)
    return r ? [r] : []
  })
  registar('recintos:definirCoordenadas', (id: number, lat: number, lng: number, descricao: string) => {
    const recinto = repos.obterRecinto(id)
    if (!recinto) return repos.listarRecintos()
    repos.atualizarRecinto(id, {
      nome: recinto.nome,
      morada: recinto.morada ?? descricao,
      lat,
      lng,
      coordsManuais: true
    })
    invalidarCache({ recintoId: id })
    return repos.listarRecintos()
  })
  registar('recintos:confirmar', (id: number, confirmado: boolean) => {
    repos.confirmarRecinto(id, confirmado)
    // Confirmar fecha o alerta; marcar outra vez por confirmar volta a abri-lo.
    avisarSobreRecintos()
    return repos.listarRecintos()
  })
  registar('recintos:confirmarTodos', () => {
    repos.confirmarTodosRecintos()
    repos.apagarAlertasDeRecintosConfirmados()
    return repos.listarRecintos()
  })

  // -- Competições ----------------------------------------------------------
  registar('competicoes:listar', (seasonId?: number) => repos.listarCompeticoes(seasonId))
  registar('epocas:listar', () => repos.listarEpocas())
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
  /**
   * Corrige um jogo à mão. As nomeações ficam — mudar a hora não é motivo para
   * desnomear ninguém —, mas se o jogo for para cima de outro do mesmo
   * delegado, isso tem de dar alerta: ninguém está em dois recintos ao mesmo
   * tempo, e quem fez a alteração pode não se ter lembrado disso.
   */
  registar('jogos:editar', (id: number, dados: EdicaoJogo) => {
    const jogo = repos.editarJogo(id, dados)
    if (!jogo) return null

    const folga = folgaDe(obterConfiguracaoMotor())
    const alertas: repos.EntradaAlerta[] = []
    // Sem data não há colisão possível: o jogo ainda não está marcado.
    for (const nomeacao of jogo.dataHora ? jogo.nomeacoes : []) {
      const agenda = repos.jogosDoDelegadoPerto(nomeacao.delegadoId, jogo.dataHora!, folga, jogo.id)
      for (const colisao of agenda) {
        alertas.push({
          // A chave inclui os dois jogos: mexer outra vez gera alerta novo.
          chave: `conflito-manual:${jogo.id}:${colisao.id}:${jogo.dataHora ?? 'sem-data'}`,
          tipo: 'CONFLITO',
          jogoId: jogo.id,
          competicao: jogo.competicaoNome,
          descricao: `${jogo.clubeCasaNome} × ${jogo.clubeForaNome}`,
          dataHora: jogo.dataHora,
          detalhe:
            `Depois da alteração, ${nomeacao.delegadoNome} fica com outro jogo demasiado perto deste: ` +
            `${colisao.clubeCasaNome} × ${colisao.clubeForaNome} ${descreverQuando(colisao.dataHora!, jogo.dataHora!)}. ` +
            'Um dos dois tem de mudar de delegado.'
        })
      }
    }
    const criados = repos.criarAlertas(alertas)
    if (criados.length) emitirAlertas(criados)
    // A correção pode ter posto o jogo num recinto ainda por localizar.
    avisarSobreRecintos()
    return jogo
  })
  /** Devolve o jogo ao controlo da FPF, voltando a ser atualizado. */
  registar('jogos:seguirFpf', (id: number) => repos.seguirFpfDeNovo(id))

  /** Marca um jogo como levando delegado (ou devolve-o à regra da competição). */
  registar('jogos:levaDelegado', (id: number, leva: boolean | null) => {
    repos.definirLevaDelegado(id, leva)
    // Um jogo trazido para a lista passa a precisar de km: se o recinto não
    // tiver coordenadas, é agora que o coordenador tem de saber.
    if (leva) avisarSobreRecintos()
    return repos.obterJogoDetalhado(id)
  })

  registar('jogos:esconder', (id: number, escondido: boolean) => {
    repos.esconderJogo(id, escondido)
    return repos.obterJogoDetalhado(id)
  })
  registar('jogos:escondidos', () => repos.jogosEscondidos())
  registar('jogos:historico', (filtro?: FiltroJogosApi) => repos.historicoJogos(filtro ?? {}))

  registar('jogos:importarCsv', (texto: string, seasonId: number, descricaoEpoca: string) =>
    importarCsv(texto, seasonId, descricaoEpoca)
  )

  // -- Nomeações ------------------------------------------------------------
  registar('nomeacoes:candidatos', (jogoId: number, papel: PapelNomeacao) =>
    candidatosParaJogo(jogoId, papel)
  )
  registar(
    'nomeacoes:nomear',
    (dados: { jogoId: number; delegadoId: number; papel: PapelNomeacao; motivoOverride?: string | null }) => {
      const delegado = repos.obterDelegado(dados.delegadoId)
      registarAlteracao(
        dados.jogoId,
        dados.papel,
        `nomeação de ${delegado?.nome ?? 'delegado'} como ${etiquetaDoPapel(dados.papel).toLowerCase()}`,
        dados.delegadoId
      )
      return nomear(dados)
    }
  )
  // `delegadoId` só é preciso nas sombras, que são várias por jogo.
  registar('nomeacoes:remover', (jogoId: number, papel: PapelNomeacao, delegadoId?: number) => {
    const removida = repos
      .listarNomeacoesDoJogo(jogoId)
      .find((n) => n.papel === papel && (delegadoId == null || n.delegadoId === delegadoId))
    registarAlteracao(
      jogoId,
      papel,
      removida
        ? `remoção de ${removida.delegadoNome} (${etiquetaDoPapel(papel).toLowerCase()})`
        : 'remoção',
      removida?.delegadoId ?? delegadoId ?? null
    )
    repos.removerNomeacao(jogoId, papel, delegadoId)
    return repos.obterJogoDetalhado(jogoId)
  })
  registar('nomeacoes:ultimaAccao', () => ultimaAccao())
  registar('nomeacoes:desfazer', () => desfazerUltimaAccao())
  registar('nomeacoes:proposta', (jogoIds: number[], opcoes?: OpcoesProposta) =>
    propostaAutomatica(jogoIds, opcoes)
  )
  /** As nomeações em lista, para o ecrã de exportação. */
  registar('nomeacoes:listar', (filtro?: repos.FiltroNomeacoes) => repos.listarNomeacoes(filtro))
  registar('nomeacoes:aplicarProposta', (propostas: PropostaAutomatica[]) => {
    // Uma proposta mexe em muitos jogos; desfazer só o último seria enganador.
    esquecerUltimaAccao()
    return aplicarProposta(propostas)
  })

  // -- Dashboard ------------------------------------------------------------
  registar('dashboard:km', (seasonId?: number) => repos.tabelaKm(seasonId))
  /** Os jogos de um delegado numa época, para explicar os km do dashboard. */
  registar('dashboard:jogosDoDelegado', (delegadoId: number, seasonId?: number) =>
    repos.jogosDoDelegado(delegadoId, seasonId)
  )
  registar('dashboard:porCompeticao', (seasonId?: number) => repos.matrizPorCompeticao(seasonId))
  registar('dashboard:repeticoesClube', (seasonId?: number) => repos.repeticoesPorDelegado(seasonId))

  // -- Importação FPF -------------------------------------------------------
  registar('fpf:catalogo', async (seasonId?: number): Promise<CatalogoFpf> => obterCatalogo(cliente(), seasonId))
  registar('fpf:competicoesDaAssociacao', (associationId: number, seasonId: number) =>
    competicoesDaAssociacao(cliente(), associationId, seasonId)
  )
  registar('fpf:sincronizar', async (pedido: PedidoSincronizacaoApi) => {
    const emitir = (p: ProgressoSincronizacao): void => {
      for (const janela of BrowserWindow.getAllWindows()) janela.webContents.send('fpf:progresso', p)
    }
    // Uma sincronização grande demora minutos; sem isto o Windows suspende a
    // rede da aplicação a meio e as jornadas começam a falhar.
    const bloqueio = powerSaveBlocker.start('prevent-app-suspension')
    try {
      return await sincronizar(cliente(), pedido, emitir)
    } finally {
      if (powerSaveBlocker.isStarted(bloqueio)) powerSaveBlocker.stop(bloqueio)
    }
  })

  // -- Alertas e atualização automática --------------------------------------
  registar('alertas:listar', (apenasPorLer?: boolean) => repos.listarAlertas(apenasPorLer ?? false))
  registar('alertas:marcarLido', (id: number, lido: boolean) => {
    repos.marcarAlertaLido(id, lido)
    return repos.listarAlertas(false)
  })
  registar('alertas:marcarTodosLidos', () => {
    repos.marcarTodosAlertasLidos()
    return repos.listarAlertas(false)
  })
  registar('alertas:apagar', (id: number) => {
    repos.apagarAlerta(id)
    return repos.listarAlertas(false)
  })
  registar('sync:estado', () => estadoAtualizacao())
  registar('sync:agora', async () => {
    // Uma atualização completa torna escusada a nova tentativa que estivesse agendada.
    cancelarNovaTentativa()
    const bloqueio = powerSaveBlocker.start('prevent-app-suspension')
    try {
      const resultado = await atualizarJogos(cliente(), (p) => {
        for (const janela of BrowserWindow.getAllWindows()) janela.webContents.send('fpf:progresso', p)
      })
      // Se ficaram competições por ler, volta a tentar-se sozinho daqui a pouco.
      depoisDeAtualizar(resultado, { novaSequencia: true })
      return resultado
    } finally {
      if (powerSaveBlocker.isStarted(bloqueio)) powerSaveBlocker.stop(bloqueio)
    }
  })

  // -- Configuração ---------------------------------------------------------
  registar('config:motor', () => obterConfiguracaoMotor())
  registar('config:guardarMotor', (config: ConfiguracaoMotor) => guardarConfiguracaoMotor(config))
  registar('config:ler', (chave: string) => lerConfig(chave))
  registar('config:escrever', (chave: string, valor: string) => escreverConfig(chave, valor))
}
