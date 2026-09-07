import { app, BrowserWindow, shell } from 'electron'
import { join, dirname } from 'node:path'
import { abrirBaseDados, caminhoBaseDados } from './db'
import { clienteFpfPartilhado, fecharCliente, registarIpc } from './ipc'
import { iniciarAgendador, pararAgendador } from './sync/agendador'

/**
 * Raiz portátil: em produção é a pasta que contém o executável, para que a
 * aplicação e os seus dados vivam numa única pasta copiável. Em desenvolvimento
 * é a raiz do projeto.
 */
function raizPortatil(): string {
  if (!app.isPackaged) return process.cwd()
  return process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe'))
}

let janela: BrowserWindow | null = null

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Nomeações de Delegados — FPF',
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  janela.on('ready-to-show', () => janela?.show())

  // A janela oculta usada para contornar o Cloudflare também conta para
  // `window-all-closed`, por isso o encerramento é ancorado na janela principal.
  janela.on('closed', () => {
    janela = null
    pararAgendador()
    fecharCliente()
    if (process.platform !== 'darwin') app.quit()
  })

  // Links externos abrem no browser do sistema, nunca dentro da aplicação.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void janela.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const caminho = caminhoBaseDados(raizPortatil())
  abrirBaseDados(caminho)
  registarIpc({ versao: app.getVersion(), caminhoBaseDados: caminho })

  criarJanela()
  iniciarAgendador(clienteFpfPartilhado)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

app.on('window-all-closed', () => {
  fecharCliente()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', fecharCliente)
