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

const ECRAS = [
  'Nomeações',
  'Histórico',
  'Escondidos',
  'Dashboard',
  'Alertas',
  'Delegados',
  'Clubes e recintos',
  'Importação',
  'Definições'
]

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
    seasonDescricao: '2026-2027',
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

  // Um recinto por localizar, para o ecrã de recintos ter o caso real a mostrar.
  repos.encontrarOuCriarRecinto('Campo Sem Coordenadas')

  const jogos = repos.listarJogos()
  void nomear({ jogoId: jogos[0].id, delegadoId: delegados[0].id, papel: 'PRINCIPAL' })
}

app.whenReady().then(async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'delegados-ui-'))
  const caminho = join(pasta, 'data', 'teste.db')
  // As verificações usam pastas temporárias; as cópias de segurança não
  // podem ir parar às do utilizador.
  abrirBaseDados(caminho, { pastaCopias: join(pasta, 'backups'), semearRecintos: false })
  escreverConfig('geo.osrmUrl', 'http://127.0.0.1:1') // distâncias em linha reta
  semear()
  registarIpc({ versao: app.getVersion(), caminhoBaseDados: caminho })

  const erros: string[] = []
  const janela = new BrowserWindow({
    width: 1600,
    height: 980,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      // A janela está oculta, e o Chromium trava as animações nesse caso. Sem
      // isto, o zoom do Leaflet nunca chega ao fim e o teste do mapa não mede
      // nada — passaria mesmo com o defeito presente.
      backgroundThrottling: false
    }
  })

  janela.webContents.on('console-message', (_e, nivel, mensagem, linha, origem) => {
    // 3 = error. Guarda-se a origem: sem ela, um erro do Leaflet podia vir de
    // qualquer um dos sítios onde o mapa é montado ou destruído.
    if (nivel >= 3) erros.push(`${mensagem} (${origem}:${linha})`)
  })
  janela.webContents.on('render-process-gone', (_e, detalhes) =>
    erros.push(`render-process-gone: ${detalhes.reason}`)
  )

  try {
    await janela.loadFile(join(__dirname, '../renderer/index.html'))
    // A mensagem de consola diz o quê mas não o porquê. Guardar a pilha de
    // chamadas é o que permite saber de onde veio um erro de dentro do Leaflet.
    await janela.webContents.executeJavaScript(
      `(() => {
         window.__pilhas = [];
         addEventListener('error', (e) => window.__pilhas.push((e.error && e.error.stack) || e.message));
       })()`
    )
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
      `menu com os ${ECRAS.length} ecrãs`,
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

    // O zoom lê-se do atributo `data-zoom`, que o componente do mapa mantém a
    // partir do estado do Leaflet. Os tiles não servem: numa janela oculta o
    // Chromium não os volta a carregar, e o nível lido ficava sempre igual.
    const zoomDoMapa = async (): Promise<string> =>
      (await janela.webContents.executeJavaScript(
        "document.querySelector('.leaflet-container')?.getAttribute('data-zoom') ?? ''"
      )) as string

    // Numa janela oculta a animação do Leaflet demora mais de um segundo a
    // terminar, por isso espera-se pela mudança em vez de adivinhar um tempo.
    const esperarZoomDiferenteDe = async (anterior: string, limiteMs = 8000): Promise<string> => {
      const fim = Date.now() + limiteMs
      let atual = await zoomDoMapa()
      while (atual === anterior && Date.now() < fim) {
        await new Promise((r) => setTimeout(r, 200))
        atual = await zoomDoMapa()
      }
      return atual
    }

    const zoomInicial = await zoomDoMapa()
    await janela.webContents.executeJavaScript(
      "document.querySelector('.leaflet-control-zoom-in')?.click()"
    )
    const zoomAntes = await esperarZoomDiferenteDe(zoomInicial)
    // Sem isto o teste seria vazio: se o zoom não tivesse mudado, comparar
    // antes com depois passaria mesmo com o defeito presente.
    verificar(
      'o botão de zoom altera mesmo o nível do mapa',
      zoomInicial !== '' && zoomAntes !== '' && Number(zoomAntes) > Number(zoomInicial),
      `→ ${zoomInicial} para ${zoomAntes}`
    )

    await janela.webContents.executeJavaScript(
      "document.querySelector('.leaflet-marker-icon')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))"
    )
    await new Promise((r) => setTimeout(r, 2500))
    const zoomDepois = await zoomDoMapa()
    verificar(
      'passar o rato num pino não mexe no zoom',
      zoomAntes !== '' && zoomAntes === zoomDepois,
      `→ antes ${zoomAntes}, depois ${zoomDepois}`
    )

    const irPara = async (nome: string): Promise<void> => {
      await janela.webContents.executeJavaScript(
        `[...document.querySelectorAll('.barra-lateral button')].find((b) => b.textContent.includes(${JSON.stringify(
          nome
        )}))?.click()`
      )
      await new Promise((r) => setTimeout(r, 700))
    }

    // Nomear pela interface, que é também o que dá cor à linha do jogo.
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.candidato button')].find((b) => b.textContent.trim() === 'Principal')?.click()"
    )
    await new Promise((r) => setTimeout(r, 1200))
    const comCor = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.item-jogo.nomeado, .item-jogo.parcial').length"
    )) as number
    verificar('os jogos com delegado ficam com cor própria', comCor > 0, `→ ${comCor} com cor`)

    // Esconder um jogo é uma ação destrutiva à vista do coordenador (o jogo
    // sai da lista), por isso confirma-se que sai mesmo e que volta. Esconde-se
    // o último da lista: os primeiros podem já ter passado da hora, e um jogo
    // passado não volta a aparecer nos escondidos (é o comportamento pedido).
    const jogosAntes = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.item-jogo').length"
    )) as number
    const nomeDoJogo = (await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.item-jogo .equipas')].at(-1)?.textContent ?? ''"
    )) as string
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.item-jogo .esconder')].at(-1)?.click()"
    )
    await new Promise((r) => setTimeout(r, 900))
    const jogosDepois = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.item-jogo').length"
    )) as number
    verificar(
      'esconder tira o jogo da lista',
      jogosDepois === jogosAntes - 1,
      `→ ${jogosAntes} para ${jogosDepois}`
    )

    await irPara('Escondidos')
    const noEcraEscondidos = (await janela.webContents.executeJavaScript(
      "document.querySelector('.corpo-ecra')?.innerText ?? ''"
    )) as string
    verificar(
      'o jogo escondido aparece no ecrã Escondidos',
      noEcraEscondidos.includes(nomeDoJogo.split('×')[0].trim()),
      `→ ${noEcraEscondidos.slice(0, 90).replace(/\s+/g, ' ')}`
    )
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Repor')?.click()"
    )
    await new Promise((r) => setTimeout(r, 900))
    await irPara('Nomeações')
    const reposto = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.item-jogo').length"
    )) as number
    verificar('repor devolve o jogo à lista', reposto === jogosAntes, `→ ${reposto} jogos`)

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

    // A faixa dos jogos por nomear: a lista só aparece com o rato em cima, e
    // clicar numa linha tem de levar ao jogo. A faixa vive no ecrã de
    // nomeações, e a secção anterior deixou-nos nas definições.
    await irPara('Nomeações')
    const faixa = (await janela.webContents.executeJavaScript(
      "document.querySelector('.faixa-urgentes .resumo')?.innerText.replace(/\\s+/g, ' ') ?? ''"
    )) as string
    if (faixa === '') {
      // Diagnóstico: sem isto ficava-se sem saber se o problema é a faixa não
      // aparecer, o ecrã errado estar aberto, ou não haver jogos por nomear.
      const contexto = (await janela.webContents.executeJavaScript(
        `JSON.stringify({
           ecra: document.querySelector('.cabecalho-ecra h1')?.textContent,
           jogos: document.querySelectorAll('.item-jogo').length,
           semNomeacoes: document.querySelectorAll('.item-jogo:not(.nomeado):not(.parcial)').length
         })`
      )) as string
      log(`     (sem faixa: ${contexto})`)
    }
    verificar(
      'a faixa anuncia os jogos por nomear que estão a chegar',
      /por nomear/.test(faixa),
      `→ ${faixa}`
    )
    const listaEscondida = (await janela.webContents.executeJavaScript(
      `(() => {
         const lista = document.querySelector('.faixa-urgentes .lista');
         return lista ? getComputedStyle(lista).display : 'sem faixa';
       })()`
    )) as string
    verificar('a lista está fechada até o rato lá passar', listaEscondida === 'none', `→ ${listaEscondida}`)

    // `:hover` não se simula com eventos, por isso pergunta-se ao CSS o que
    // aconteceria — é o mesmo seletor que o browser aplica.
    const abreComHover = (await janela.webContents.executeJavaScript(
      `(() => {
         const regras = [...document.styleSheets].flatMap((f) => {
           try { return [...f.cssRules] } catch { return [] }
         });
         return regras.some(
           (r) => r.selectorText === '.faixa-urgentes:hover .lista' && r.style.display === 'block'
         );
       })()`
    )) as boolean
    verificar('passar o rato na faixa abre a lista', abreComHover)

    const linhas = (await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.faixa-urgentes .linha-urgente').length"
    )) as number
    verificar('a faixa lista os jogos em falta', linhas > 0, `→ ${linhas} jogos`)

    log('\n3b. Dashboard: ordenação e altura das tabelas')
    await irPara('Dashboard')

    // Ordenar por uma coluna tem de mudar mesmo a ordem das linhas. Sem
    // comparar antes e depois, o teste passava com os cabeçalhos inertes.
    const primeiroDelegado = async (): Promise<string> =>
      (await janela.webContents.executeJavaScript(
        "document.querySelector('.tabela tbody tr td:nth-child(2)')?.textContent?.trim() ?? ''"
      )) as string
    const antesDeOrdenar = await primeiroDelegado()
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.tabela th.ordenavel')].find((t) => t.textContent.includes('Delegado'))?.click()"
    )
    await new Promise((r) => setTimeout(r, 400))
    const depoisDeOrdenar = await primeiroDelegado()
    verificar(
      'ordenar por delegado muda a ordem das linhas',
      antesDeOrdenar !== '' && depoisDeOrdenar !== '' && antesDeOrdenar !== depoisDeOrdenar,
      `→ "${antesDeOrdenar}" para "${depoisDeOrdenar}"`
    )
    // E clicar outra vez inverte.
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.tabela th.ordenavel')].find((t) => t.textContent.includes('Delegado'))?.click()"
    )
    await new Promise((r) => setTimeout(r, 400))
    verificar(
      'clicar outra vez inverte o sentido',
      (await primeiroDelegado()) !== depoisDeOrdenar,
      `→ ${await primeiroDelegado()}`
    )

    // As matrizes não podem ter scroll vertical próprio: o cartão cresce com o
    // número de delegados e quem rola é a página.
    const scrollInterno = (await janela.webContents.executeJavaScript(
      `(() => {
         const caixas = [...document.querySelectorAll('.envolve-tabela')];
         return caixas.filter((c) => c.scrollHeight > c.clientHeight + 1).length;
       })()`
    )) as number
    verificar(
      'nenhuma tabela do dashboard tem scroll vertical próprio',
      scrollInterno === 0,
      `→ ${scrollInterno} com scroll interno`
    )

    log('\n4. Recintos por confirmar')
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.barra-lateral button')].find(b => b.textContent.includes('Clubes')).click()"
    )
    await new Promise((r) => setTimeout(r, 500))
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.cabecalho-ecra .grupo-botoes button')].find(b => b.textContent.includes('Recintos')).click()"
    )
    await new Promise((r) => setTimeout(r, 700))
    const filtros = (await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.painel .grupo-botoes button')].map(b => b.textContent.trim()).join(' | ')"
    )) as string
    verificar(
      'o ecrã separa os recintos que faltam dos que estão por confirmar',
      /Sem coords/.test(filtros) && /Por confirmar/.test(filtros),
      `→ ${filtros}`
    )
    const botaoLote = (await janela.webContents.executeJavaScript(
      "([...document.querySelectorAll('.painel button')].map(b => b.textContent).find(t => t.includes('em falta')) ?? '')"
    )) as string
    verificar('oferece localizar de uma vez os que faltam', botaoLote.includes('em falta'), `→ ${botaoLote}`)

    log('\n5. Aviso de gravação')
    // Sem isto, carregar em "Guardar" não dava sinal nenhum de ter resultado.
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('.barra-lateral button')].find(b => b.textContent.includes('Delegados')).click()"
    )
    await new Promise((r) => setTimeout(r, 600))
    await janela.webContents.executeJavaScript("[...document.querySelectorAll('.item-jogo')][0].click()")
    await new Promise((r) => setTimeout(r, 700))
    await janela.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar').click()"
    )
    await new Promise((r) => setTimeout(r, 900))
    const aviso = (await janela.webContents.executeJavaScript(
      "document.querySelector('.avisos .toast')?.innerText.replace(/\\s+/g,' ') ?? ''"
    )) as string
    const classeAviso = (await janela.webContents.executeJavaScript(
      "document.querySelector('.avisos .toast')?.className ?? ''"
    )) as string
    verificar(
      'gravar mostra confirmação no ecrã',
      aviso.length > 0 && classeAviso.includes('sucesso'),
      `→ "${aviso}"`
    )

    log('\n6. Indicador de atualização')
    // A atualização automática corre em segundo plano e demora minutos: sem
    // este indicador o coordenador vê um ecrã vazio e julga que nada funciona.
    janela.webContents.send('fpf:progresso', {
      etapa: 'LIGA 3 PLACARD — Série A, jornada 5',
      atual: 12,
      total: 121,
      concluido: false
    })
    await new Promise((r) => setTimeout(r, 600))
    const indicador = (await janela.webContents.executeJavaScript(
      "document.querySelector('.sync-estado')?.innerText.replace(/\\s+/g,' ') ?? ''"
    )) as string
    verificar(
      'o progresso aparece na barra lateral, em qualquer ecrã',
      indicador.includes('A atualizar') && indicador.includes('121'),
      `→ ${indicador}`
    )

    janela.webContents.send('sync:concluida', {
      quando: new Date().toISOString(),
      criados: 0,
      atualizados: 0,
      alertas: [],
      erros: []
    })
    await new Promise((r) => setTimeout(r, 600))
    verificar(
      'o indicador desaparece quando a atualização acaba',
      (await janela.webContents.executeJavaScript("document.querySelector('.sync-estado') === null")) as boolean
    )

    log('\n7. Erros de consola')
    const pilhas = (await janela.webContents.executeJavaScript('window.__pilhas ?? []')) as string[]
    verificar('sem erros no renderer', erros.length === 0, erros.length ? `→ ${erros.join(' || ')}` : '')
    for (const pilha of pilhas) log(`     ${pilha.replace(/\n\s*/g, ' <- ').slice(0, 600)}`)
  } catch (erro) {
    verificar('percurso completo sem exceções', false, `→ ${(erro as Error).message}`)
  } finally {
    janela.destroy()
    // O SQLite ainda tem o ficheiro aberto; se o Windows o bloquear, a pasta
    // temporária fica para trás e não vale a pena falhar a verificação por isso.
    try {
      rmSync(pasta, { recursive: true, force: true })
    } catch {
      /* pasta temporária, o sistema limpa-a depois */
    }
  }

  log(falhas === 0 ? '\nInterface verificada sem falhas.\n' : `\n${falhas} verificações falharam.\n`)
  app.exit(falhas === 0 ? 0 : 1)
})
