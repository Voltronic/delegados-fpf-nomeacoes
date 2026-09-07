/**
 * Verificação da interface: arranca a janela real, percorre todos os ecrãs e
 * reporta qualquer erro de consola ou ecrã que não monte.
 *
 * Corre com `npm run verificar:ui`. Usa uma base de dados temporária já semeada,
 * para os ecrãs terem conteúdo a sério para desenhar.
 */
import { app, BrowserWindow } from 'electron'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { abrirBaseDados, escreverConfig } from './db'
import * as repos from './db/repos'
import { nomear } from './engine/servico'
import { registarIpc } from './ipc'

const RELATORIO = join(process.cwd(), 'verificacao-ui.log')
writeFileSync(RELATORIO, '')
const log = (l: string): void => {
  console.log(l)
  appendFileSync(RELATORIO, `${l}\n`)
}

let falhas = 0
function verificar(descricao: string, condicao: boolean, detalhe = ''): void {
  if (!condicao) falhas++
  log(`  ${condicao ? 'OK   ' : 'FALHA'} ${descricao}${detalhe ? ` ${detalhe}` : ''}`)
}

const ECRAS = ['Nomeações', 'Dashboard', 'Delegados', 'Clubes e recintos', 'Importação', 'Definições']

function semear(): void {
  const delegados = [
    { numero: '101', nome: 'Ana Ribeiro', lat: 41.35, lng: -8.62, nivel: 'ELITE' as const },
    { numero: '102', nome: 'Bruno Costa', lat: 40.2, lng: -8.42, nivel: 'PRINCIPAL' as const },
    { numero: '103', nome: 'Carla Nunes', lat: 38.72, lng: -9.14, nivel: 'PRINCIPAL' as const }
  ].map((d) =>
    repos.criarDelegado({
      ...d,
      morada: 'morada de teste',
      telefone: null,
      email: null,
      ativo: true,
      notas: null,
      coordsManuais: true
    })
  )

  const competicao = repos.guardarCompeticao({
    fpfCompetitionId: 29529,
    seasonId: 106,
    nome: 'CAMPEONATO DE PORTUGAL',
    organizacao: 'Competições FPF',
    ativa: true,
    nivelMinimo: null,
    usaDelegadoCampo: true
  })

  const clubes = ['Sc Braga "B"', 'Cdc Montalegre', 'Fc Tirsense'].map((n) => repos.encontrarOuCriarClube(n))
  const recintos = [
    { nome: 'Estádio Amélia Morais', lat: 41.55, lng: -8.42 },
    { nome: 'Estádio Doutor Diogo Alves Vaz Pereira', lat: 41.82, lng: -7.79 },
    { nome: 'Estádio Abel Alves Figueiredo', lat: 41.34, lng: -8.3 }
  ].map((r, i) => {
    const criado = repos.encontrarOuCriarRecinto(r.nome)
    const atualizado = repos.atualizarRecinto(criado.id, { ...r, morada: null, coordsManuais: true })
    repos.definirRecintoDoClube(clubes[i].id, null, atualizado.id)
    return atualizado
  })

  // Jogos nesta semana, para o ecrã de nomeações abrir já com conteúdo.
  const hoje = new Date()
  for (let i = 0; i < 4; i++) {
    const data = new Date(hoje)
    data.setDate(hoje.getDate() + i)
    const p = (n: number): string => String(n).padStart(2, '0')
    repos.guardarJogo({
      chaveNatural: `ui:${i}`,
      competicaoId: competicao.id,
      fase: '1ª FASE',
      serie: 'SÉRIE 1',
      jornada: String(i + 1),
      fpfFixtureId: 652366,
      fpfMatchId: null,
      dataHora: `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}T15:00`,
      clubeCasaId: clubes[i % 3].id,
      clubeForaId: clubes[(i + 1) % 3].id,
      recintoId: recintos[i % 3].id,
      recintoTextoFpf: null,
      estado: 'AGENDADO'
    })
  }

  const jogos = repos.listarJogos()
  void nomear({ jogoId: jogos[0].id, delegadoId: delegados[0].id, papel: 'PRINCIPAL' })
}

app.whenReady().then(async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'delegados-ui-'))
  const caminho = join(pasta, 'data', 'teste.db')
  abrirBaseDados(caminho)
  escreverConfig('geo.osrmUrl', 'http://127.0.0.1:1') // distâncias em linha reta
  semear()
  registarIpc({ versao: app.getVersion(), caminhoBaseDados: caminho })

  const erros: string[] = []
  const janela = new BrowserWindow({
    width: 1600,
    height: 980,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.mjs'), sandbox: false, contextIsolation: true }
  })

  janela.webContents.on('console-message', (_e, nivel, mensagem) => {
    // 3 = error
    if (nivel >= 3) erros.push(mensagem)
  })
  janela.webContents.on('render-process-gone', (_e, detalhes) =>
    erros.push(`render-process-gone: ${detalhes.reason}`)
  )

  try {
    await janela.loadFile(join(__dirname, '../renderer/index.html'))
    await new Promise((r) => setTimeout(r, 1500))

    log('\n1. Arranque da interface')
    const montou = (await janela.webContents.executeJavaScript(
      "document.querySelector('#raiz')?.children.length > 0"
    )) as boolean
    verificar('a aplicação monta', montou)

    const menu = (await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.barra-lateral button')].map(b => b.textContent.trim())"
    )) as string[]
    verificar(
      'menu com os seis ecrãs',
      ECRAS.every((e) => menu.some((m) => m.includes(e))),
      `→ ${menu.join(' | ')}`
    )

    log('\n2. Ecrã de nomeações')
    const jogosVisiveis = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.item-jogo').length"
    )) as number
    verificar('lista os jogos da semana', jogosVisiveis > 0, `→ ${jogosVisiveis} jogos`)

    await new Promise((r) => setTimeout(r, 1200))
    const candidatos = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.candidato').length"
    )) as number
    verificar('mostra candidatos ordenados', candidatos > 0, `→ ${candidatos} candidatos`)

    const primeiro = (await janela.webContents.executeJavaScript(
      "document.querySelector('.candidato')?.innerText.replace(/\\s+/g,' ').slice(0,150) ?? ''"
    )) as string
    verificar('o cartão mostra km da época e da viagem', /Época.*Viagem/.test(primeiro), `→ ${primeiro}`)

    const mapa = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.leaflet-container .pino').length"
    )) as number
    verificar('o mapa desenha os pinos', mapa > 0, `→ ${mapa} pinos (recinto + delegados)`)

    log('\n3. Navegação por todos os ecrãs')
    for (const nome of ECRAS.slice(1)) {
      await janela.webContents.executeJavaScript(
        `[...document.querySelectorAll('.barra-lateral button')].find(b => b.textContent.includes(${JSON.stringify(
          nome
        )})).click()`
      )
      await new Promise((r) => setTimeout(r, 900))
      const titulo = (await janela.webContents.executeJavaScript(
        "document.querySelector('.cabecalho-ecra h1')?.textContent ?? ''"
      )) as string
      const conteudo = (await janela.webContents.executeJavaScript(
        "document.querySelector('.corpo-ecra')?.innerText.length ?? 0"
      )) as number
      verificar(`ecrã "${nome}" desenha`, conteudo > 30, `→ título "${titulo}", ${conteudo} caracteres`)
    }

    log('\n4. Erros de consola')
    verificar('sem erros no renderer', erros.length === 0, erros.length ? `→ ${erros.join(' || ')}` : '')
  } catch (erro) {
    verificar('percurso completo sem exceções', false, `→ ${(erro as Error).message}`)
  } finally {
    janela.destroy()
    rmSync(pasta, { recursive: true, force: true })
  }

  log(falhas === 0 ? '\nInterface verificada sem falhas.\n' : `\n${falhas} verificações falharam.\n`)
  app.exit(falhas === 0 ? 0 : 1)
})
