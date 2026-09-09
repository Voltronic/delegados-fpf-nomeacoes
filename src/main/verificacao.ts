/**
 * Verificação de ponta a ponta do processo principal, sem interface.
 *
 * Corre com `npm run verificar`. Usa uma base de dados temporária e exercita a
 * cadeia toda: migrações, repositórios, cálculo de distâncias, motor de
 * sugestão, proposta automática e — se houver rede — os endpoints reais da FPF.
 */
import { app } from 'electron'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import {
  abrirBaseDados,
  escreverConfig,
  listarCopiasSeguranca,
  obterBaseDados,
  reporCopiaSeguranca,
  versaoConhecida,
  versaoDoEsquema
} from './db'
import * as repos from './db/repos'
import { semearRecintos } from './db/semente'
import { exportarDelegados, importarDelegados } from './delegados/servico'
import { normalizarNome } from './fpf/html'
import { RECINTOS_CONHECIDOS } from './geo/recintosConhecidos'
import {
  desfazerUltimaAccao,
  esquecerUltimaAccao,
  registarAlteracao,
  ultimaAccao
} from './engine/desfazer'
import { candidatosParaJogo, nomear, propostaAutomatica } from './engine/servico'
import { ClienteFpf } from './fpf/cliente'
import { parseDetalhesCompeticao, parseEpocas, parseJogosJornada, parseOrganizacoes } from './fpf/parsers'
import { importarCsv, sincronizar } from './fpf/sincronizacao'
import { atualizarJogos } from './sync/agendador'

const verde = (t: string): string => t
const vermelho = (t: string): string => t

// No Windows o Electron é uma aplicação GUI e não escreve na consola, por isso o
// relatório vai também para um ficheiro, que é o que se lê no fim.
const RELATORIO = join(process.cwd(), 'verificacao.log')
writeFileSync(RELATORIO, '')

function log(linha: string): void {
  console.log(linha)
  appendFileSync(RELATORIO, `${linha}\n`)
}

let falhas = 0
function verificar(descricao: string, condicao: boolean, detalhe = ''): void {
  if (condicao) {
    log(`  ${verde('OK')}   ${descricao}${detalhe ? ` ${detalhe}` : ''}`)
  } else {
    falhas++
    log(`  ${vermelho('FALHA')} ${descricao}${detalhe ? ` ${detalhe}` : ''}`)
  }
}

async function principal(): Promise<void> {
  const pasta = mkdtempSync(join(tmpdir(), 'delegados-'))
  const caminho = join(pasta, 'data', 'teste.db')

  try {
    log('\n1. Base de dados e migrações')
    // As verificações usam pastas temporárias; as cópias de segurança não
    // podem ir parar às do utilizador.
    abrirBaseDados(caminho, { pastaCopias: join(pasta, 'backups'), semearRecintos: false })
    // Distâncias em linha reta, para a verificação não depender de serviços externos.
    escreverConfig('geo.osrmUrl', 'http://127.0.0.1:1')
    verificar('base de dados criada e migrada', repos.listarDelegados().length === 0)

    // Reabrir a base de dados tem de deixar uma cópia de segurança utilizável:
    // foi a falta de uma que fez perder dados reais.
    const pastaCopias = join(pasta, 'backups')
    repos.criarDelegado({
      numero: '999',
      nome: 'Delegado da cópia',
      morada: 'morada de teste',
      lat: 40,
      lng: -8,
      nivel: 'PRINCIPAL',
      telefone: null,
      email: null,
      ativo: true,
      notas: null,
      coordsManuais: true
    })
    abrirBaseDados(caminho, { pastaCopias, semearRecintos: false })
    const copias = listarCopiasSeguranca(pastaCopias)
    verificar(
      'o arranque deixa uma cópia de segurança fora da pasta da aplicação',
      copias.length === 1 && !copias[0].caminho.startsWith(dirname(caminho)),
      `→ ${copias.map((c) => c.ficheiro).join(', ') || 'nenhuma'}`
    )
    // A cópia só serve se os dados lá estiverem mesmo: abre-se e conta-se.
    const daCopia = new Database(copias[0]?.caminho ?? ':memory:', { readonly: true })
    const naCopia = daCopia.prepare('SELECT COUNT(*) AS n FROM delegado').get() as { n: number }
    daCopia.close()
    verificar('a cópia contém os dados que existiam no momento', naCopia.n === 1, `→ ${naCopia.n} delegado(s)`)
    repos.apagarDelegado(repos.listarDelegados()[0].id)

    // Entregar um executável novo por cima de uma base de dados antiga tem de
    // ser suficiente: as migrações em falta correm sozinhas, e uma base de
    // dados de uma versão futura é recusada em vez de ser corrompida.
    verificar(
      'o esquema fica na versão que este executável conhece',
      versaoDoEsquema(obterBaseDados()) === versaoConhecida(),
      `→ esquema ${versaoDoEsquema(obterBaseDados())} de ${versaoConhecida()}`
    )
    const caminhoFuturo = join(pasta, 'data', 'futura.db')
    const futura = new Database(caminhoFuturo)
    futura.exec('CREATE TABLE schema_versao (versao INTEGER PRIMARY KEY, aplicada_em TEXT NOT NULL)')
    futura
      .prepare('INSERT INTO schema_versao (versao, aplicada_em) VALUES (?, ?)')
      .run(versaoConhecida() + 1, new Date().toISOString())
    futura.close()
    let recusou = ''
    try {
      abrirBaseDados(caminhoFuturo, { pastaCopias: join(pasta, 'backups') })
    } catch (erro) {
      recusou = (erro as Error).message
    }
    verificar(
      'recusa uma base de dados de uma versão mais recente',
      recusou.includes('versão mais recente'),
      `→ ${recusou || 'abriu na mesma'}`
    )
    // A ligação anterior continua a valer: a recusa acontece antes de trocar.
    verificar(
      'a base de dados em uso não foi trocada pela recusada',
      repos.listarDelegados(true).length === 0 && versaoDoEsquema(obterBaseDados()) === versaoConhecida()
    )

    // A semente de recintos confirmados: numa base de dados nova entram todos,
    // e numa que já exista nunca substitui o que lá está.
    const caminhoSemente = join(pasta, 'data', 'semente.db')
    const semente = new Database(caminhoSemente)
    semente.exec(
      `CREATE TABLE recinto (
         id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
         nome_normalizado TEXT NOT NULL UNIQUE, morada TEXT, lat REAL, lng REAL,
         coords_manuais INTEGER NOT NULL DEFAULT 0, geocodificado_em TEXT,
         origem_coords TEXT, morada_resolvida TEXT, confianca TEXT,
         confirmado INTEGER NOT NULL DEFAULT 0)`
    )
    const conhecido = RECINTOS_CONHECIDOS[0]
    const outro = RECINTOS_CONHECIDOS[1]
    // Um com coordenadas diferentes das da lista: tem de ficar como está.
    semente
      .prepare(
        `INSERT INTO recinto (nome, nome_normalizado, morada, lat, lng, confirmado)
         VALUES (?, ?, 'morada do coordenador', 1.5, 2.5, 1)`
      )
      .run(conhecido.nome, normalizarNome(conhecido.nome))
    // E outro sem coordenadas nenhumas: esse é para preencher.
    semente
      .prepare('INSERT INTO recinto (nome, nome_normalizado) VALUES (?, ?)')
      .run(outro.nome, normalizarNome(outro.nome))

    const resultadoSemente = semearRecintos(semente)
    const jaExistia = semente
      .prepare('SELECT lat, lng, morada FROM recinto WHERE nome_normalizado = ?')
      .get(normalizarNome(conhecido.nome)) as { lat: number; lng: number; morada: string }
    const preenchido = semente
      .prepare('SELECT lat, lng, confirmado FROM recinto WHERE nome_normalizado = ?')
      .get(normalizarNome(outro.nome)) as { lat: number | null; lng: number | null; confirmado: number }
    const totalSemeado = (semente.prepare('SELECT COUNT(*) AS n FROM recinto').get() as { n: number }).n
    const semCoordenadas = (
      semente.prepare('SELECT COUNT(*) AS n FROM recinto WHERE lat IS NULL').get() as { n: number }
    ).n

    verificar(
      'a semente cria os recintos que faltam e conta certo',
      totalSemeado === RECINTOS_CONHECIDOS.length &&
        resultadoSemente.criados === RECINTOS_CONHECIDOS.length - 2 &&
        resultadoSemente.preenchidos === 1,
      `→ ${totalSemeado} recintos, ${resultadoSemente.criados} criados, ${resultadoSemente.preenchidos} preenchidos`
    )
    verificar(
      'nunca mexe num recinto que já tem coordenadas',
      jaExistia.lat === 1.5 && jaExistia.lng === 2.5 && jaExistia.morada === 'morada do coordenador',
      `→ ${jaExistia.lat}, ${jaExistia.lng}`
    )
    verificar(
      'preenche o que existia sem ponto no mapa',
      preenchido.lat === outro.lat && preenchido.lng === outro.lng && preenchido.confirmado === 1
    )
    verificar('não fica nenhum recinto por localizar', semCoordenadas === 0, `→ ${semCoordenadas} sem coordenadas`)
    // Arrancar outra vez não pode voltar a mexer em nada.
    const segundaSemente = semearRecintos(semente)
    verificar(
      'arrancar outra vez não repete nem duplica',
      segundaSemente.criados === 0 &&
        segundaSemente.preenchidos === 0 &&
        (semente.prepare('SELECT COUNT(*) AS n FROM recinto').get() as { n: number }).n === totalSemeado
    )
    semente.close()

    log('\n2. Delegados, clubes e recintos')
    const delegados = [
      { numero: '101', nome: 'Delegado Norte', lat: 41.35, lng: -8.62, nivel: 'ELITE' as const },
      { numero: '102', nome: 'Delegado Centro', lat: 40.2, lng: -8.42, nivel: 'PRINCIPAL' as const },
      { numero: '103', nome: 'Delegado Sul', lat: 37.02, lng: -7.93, nivel: 'PRINCIPAL' as const },
      { numero: '104', nome: 'Delegado Lisboa', lat: 38.72, lng: -9.14, nivel: 'PRINCIPAL' as const }
    ].map((d) =>
      repos.criarDelegado({
        numero: d.numero,
        nome: d.nome,
        morada: 'morada de teste',
        lat: d.lat,
        lng: d.lng,
        nivel: d.nivel,
        telefone: null,
        email: null,
        ativo: true,
        notas: null,
        coordsManuais: true
      })
    )
    verificar('4 delegados criados', repos.listarDelegados().length === 4)

    // Ordenação por número, numericamente: por texto, "1084" vinha antes de "109".
    for (const n of ['1084', '109', '9']) {
      repos.criarDelegado({
        numero: n,
        nome: `Ordem ${n}`,
        morada: null,
        lat: null,
        lng: null,
        nivel: 'PRINCIPAL',
        telefone: null,
        email: null,
        ativo: true,
        notas: null,
        coordsManuais: false
      })
    }
    const ordem = repos.listarDelegados().map((d) => d.numero)
    verificar(
      'a lista sai por ordem crescente de número',
      ordem.join(',') === '9,101,102,103,104,109,1084',
      `→ ${ordem.join(', ')}`
    )
    for (const d of repos.listarDelegados().filter((x) => x.nome.startsWith('Ordem '))) {
      repos.apagarDelegado(d.id)
    }

    const competicao = repos.guardarCompeticao({
      fpfCompetitionId: 99999,
      seasonId: 106,
      seasonDescricao: '2026-2027',
      nome: 'Competição de Teste',
      organizacao: 'Competições FPF',
      ativa: true,
      nivelMinimo: null,
      usaDelegadoCampo: true
    })

    const clubes = ['Clube Braga', 'Clube Coimbra', 'Clube Faro', 'Clube Lisboa'].map((n) =>
      repos.encontrarOuCriarClube(n)
    )
    const recintos = [
      { nome: 'Estádio Braga', lat: 41.36, lng: -8.6 },
      { nome: 'Estádio Coimbra', lat: 40.21, lng: -8.44 },
      { nome: 'Estádio Faro', lat: 37.03, lng: -7.94 },
      { nome: 'Estádio Lisboa', lat: 38.75, lng: -9.16 }
    ].map((r) => {
      const criado = repos.encontrarOuCriarRecinto(r.nome)
      return repos.atualizarRecinto(criado.id, {
        nome: r.nome,
        morada: null,
        lat: r.lat,
        lng: r.lng,
        coordsManuais: true
      })
    })
    clubes.forEach((c, i) => repos.definirRecintoDoClube(c.id, null, recintos[i].id))
    verificar('recinto por omissão resolvido a partir do clube', repos.recintoDoClube(clubes[0].id, competicao.id) === recintos[0].id)

    // Recinto específico por competição sobrepõe-se ao de omissão.
    repos.definirRecintoDoClube(clubes[0].id, competicao.id, recintos[1].id)
    verificar(
      'recinto específico da competição tem precedência',
      repos.recintoDoClube(clubes[0].id, competicao.id) === recintos[1].id
    )
    repos.definirRecintoDoClube(clubes[0].id, competicao.id, recintos[0].id)

    log('\n3. Jogos')
    const jogoIds: number[] = []
    for (let i = 0; i < 8; i++) {
      const casa = clubes[i % 4]
      const fora = clubes[(i + 1) % 4]
      jogoIds.push(
        repos.guardarJogo({
          chaveNatural: `teste:${i}`,
          competicaoId: competicao.id,
          fase: '1ª FASE',
          serie: 'SÉRIE 1',
          jornada: String(i + 1),
          fpfFixtureId: 1000 + i,
          fpfMatchId: null,
          dataHora: `2026-09-${String(13 + i * 7).padStart(2, '0')}T15:00`,
          clubeCasaId: casa.id,
          clubeForaId: fora.id,
          recintoId: repos.recintoDoClube(casa.id, competicao.id),
          recintoTextoFpf: null,
          estado: 'AGENDADO'
        })
      )
    }
    verificar('8 jogos gravados', repos.listarJogos().length === 8)
    verificar(
      'filtro por intervalo de datas',
      repos.listarJogos({ de: '2026-09-13', ate: '2026-09-21T23:59' }).length === 2
    )

    log('\n4. Motor de sugestão')
    const primeiroJogo = repos.listarJogos()[0]
    const candidatos = await candidatosParaJogo(primeiroJogo.id, 'PRINCIPAL')
    verificar('devolve todos os delegados avaliados', candidatos.length === 4)
    verificar('todos elegíveis à partida', candidatos.every((c) => c.elegivel))
    verificar(
      'distâncias calculadas (estimativa em linha reta)',
      candidatos.every((c) => c.kmViagem != null && c.kmViagem > 0)
    )
    const jogoEmBraga = primeiroJogo.recintoNome
    verificar(
      `em ${jogoEmBraga}, o delegado mais próximo lidera com tudo igual`,
      candidatos[0].nome === 'Delegado Norte',
      `→ ${candidatos.map((c) => `${c.nome} ${c.score}`).join(' | ')}`
    )

    log('\n5. Nomeação e efeito nos km')
    await nomear({ jogoId: primeiroJogo.id, delegadoId: delegados[0].id, papel: 'PRINCIPAL' })
    await nomear({ jogoId: primeiroJogo.id, delegadoId: delegados[1].id, papel: 'CAMPO' })
    const comNomeacoes = repos.obterJogoDetalhado(primeiroJogo.id)!
    verificar('dois papéis nomeados no mesmo jogo', comNomeacoes.nomeacoes.length === 2)
    verificar(
      'km ida e volta congelados na nomeação',
      (comNomeacoes.nomeacoes[0].km ?? 0) > 0,
      `→ ${comNomeacoes.nomeacoes.map((n) => `${n.papel} ${n.km} km`).join(' | ')}`
    )

    const tabela = repos.tabelaKm(106)
    verificar('dashboard reflete os km', tabela.filter((l) => l.km > 0).length === 2)

    const segundoJogoEmBraga = repos.listarJogos().find((j) => j.id !== primeiroJogo.id && j.recintoId === recintos[0].id)
    if (segundoJogoEmBraga) {
      const seguintes = await candidatosParaJogo(segundoJogoEmBraga.id, 'PRINCIPAL')
      verificar(
        'quem já fez o clube desce na lista do jogo seguinte',
        seguintes[0].nome !== 'Delegado Norte',
        `→ ${seguintes.slice(0, 3).map((c) => c.nome).join(' > ')}`
      )
    }

    log('\n6. Bloqueios')
    repos.criarIndisponibilidade({
      delegadoId: delegados[2].id,
      dataInicio: '2026-09-01',
      dataFim: '2026-12-31',
      motivo: 'Ausente'
    })
    repos.criarVeto({ delegadoId: delegados[3].id, clubeId: clubes[1].id, motivo: 'Sócio' })
    const jogoComVeto = repos.listarJogos().find((j) => j.clubeCasaId === clubes[1].id || j.clubeForaId === clubes[1].id)!
    const comBloqueios = await candidatosParaJogo(jogoComVeto.id, 'PRINCIPAL')
    verificar(
      'indisponibilidade bloqueia',
      comBloqueios.find((c) => c.nome === 'Delegado Sul')?.bloqueios[0]?.codigo === 'INDISPONIVEL'
    )
    verificar(
      'veto de clube bloqueia',
      comBloqueios.find((c) => c.nome === 'Delegado Lisboa')?.bloqueios[0]?.codigo === 'VETO_CLUBE'
    )
    verificar('bloqueados vão para o fim', !comBloqueios[0].bloqueios.length)

    log('\n6b. Exportação e importação de delegados')
    const ficheiro = exportarDelegados()
    const antes = repos.listarDelegados(true).length
    // Reimportar o mesmo ficheiro tem de ser inofensivo: atualiza, não duplica.
    const repetida = importarDelegados(ficheiro)
    verificar(
      'reimportar o mesmo ficheiro não duplica ninguém',
      repos.listarDelegados(true).length === antes && repetida.criados === 0,
      `→ ${repetida.criados} criados, ${repetida.atualizados} atualizados`
    )
    verificar(
      'indisponibilidades e vetos sobrevivem à ida e volta',
      repos.listarIndisponibilidades(delegados[2].id).length === 1 &&
        repos.listarVetos(delegados[3].id).length === 1
    )
    // Um delegado apagado por engano volta do ficheiro, com tudo o que tinha.
    repos.apagarDelegado(delegados[3].id)
    const reposto = importarDelegados(ficheiro)
    const voltou = repos.listarDelegados(true).find((d) => d.nome === 'Delegado Lisboa')
    verificar(
      'um delegado apagado volta do ficheiro',
      reposto.criados === 1 && !!voltou && repos.listarVetos(voltou.id).length === 1,
      `→ ${reposto.criados} criado(s), ${voltou ? repos.listarVetos(voltou.id).length : 0} veto(s)`
    )

    log('\n7. Proposta automática')
    const { propostas: proposta, semSugestao } = await propostaAutomatica(jogoIds)
    const usados = new Set(proposta.flatMap((p) => [p.principal?.delegadoId, p.campo?.delegadoId]).filter(Boolean))
    verificar('propõe para os jogos ainda por nomear', proposta.length === 7, `→ ${proposta.length} jogos`)
    verificar('distribui por mais do que um delegado', usados.size >= 2, `→ ${usados.size} delegados usados`)
    verificar(
      'nunca repete delegado no mesmo jogo',
      proposta.every((p) => !p.principal || !p.campo || p.principal.delegadoId !== p.campo.delegadoId)
    )
    verificar('explica cada sugestão', proposta.every((p) => p.motivo.length > 0))
    verificar(
      'explica também os jogos que ficaram sem sugestão',
      semSugestao.every((s) => s.motivos.length > 0),
      `→ ${semSugestao.length} sem sugestão${semSugestao[0] ? `: ${semSugestao[0].motivos.join(', ')}` : ''}`
    )

    log('\n7b. Esconder jogos, histórico e alertas de recintos')
    const paraEsconder = repos.listarJogos()[0]
    const quantosAntes = repos.listarJogos().length
    repos.esconderJogo(paraEsconder.id, true)
    verificar(
      'esconder tira o jogo das listas de trabalho',
      repos.listarJogos().length === quantosAntes - 1 &&
        !repos.listarJogos().some((j) => j.id === paraEsconder.id),
      `→ ${repos.listarJogos().length} de ${quantosAntes}`
    )
    verificar(
      'o jogo escondido continua guardado e recuperável',
      repos.jogosEscondidos().some((j) => j.id === paraEsconder.id)
    )
    repos.esconderJogo(paraEsconder.id, false)
    verificar(
      'repor devolve o jogo à lista',
      repos.listarJogos().length === quantosAntes && repos.jogosEscondidos().length === 0
    )

    // Um jogo escondido cuja data já passou deixa de aparecer: foi escondido
    // por não interessar, e depois da data não há nada a repor.
    const passado = repos.guardarJogo({
      chaveNatural: 'teste:passado',
      competicaoId: competicao.id,
      fase: '1ª FASE',
      serie: 'SÉRIE 1',
      jornada: '0',
      fpfFixtureId: 999,
      fpfMatchId: null,
      dataHora: '2026-08-01T15:00',
      clubeCasaId: clubes[0].id,
      clubeForaId: clubes[1].id,
      recintoId: repos.recintoDoClube(clubes[0].id, competicao.id),
      recintoTextoFpf: null,
      estado: 'AGENDADO'
    })
    repos.esconderJogo(passado, true)
    verificar(
      'um escondido com a data passada desaparece da lista de escondidos',
      repos.jogosEscondidos().every((j) => j.id !== passado),
      `→ ${repos.jogosEscondidos().length} escondidos`
    )

    // Histórico: só entram jogos passados que tiveram delegado.
    repos.esconderJogo(passado, false)
    const semNomeacao = repos.historicoJogos()
    verificar(
      'um jogo passado sem delegado não entra no histórico',
      semNomeacao.every((j) => j.id !== passado),
      `→ ${semNomeacao.length} no histórico`
    )
    await nomear({ jogoId: passado, delegadoId: delegados[0].id, papel: 'PRINCIPAL' })
    const historico = repos.historicoJogos()
    verificar(
      'um jogo passado com delegado entra no histórico',
      historico.some((j) => j.id === passado) && historico.every((j) => j.nomeacoes.length > 0),
      `→ ${historico.length} no histórico`
    )
    verificar(
      'o histórico não mostra jogos que ainda estão para acontecer',
      historico.every((j) => (j.dataHora ?? '') < new Date().toISOString().slice(0, 16))
    )

    // A fronteira do dia: um jogo de ontem já não é trabalho por fazer, e um de
    // hoje ainda é — mesmo que a hora já tenha passado, para não desaparecer da
    // lista com o coordenador ainda a tratar dele.
    const diaDe = (deslocamento: number): string => {
      const d = new Date()
      d.setDate(d.getDate() + deslocamento)
      const p2 = (n: number): string => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    }
    const ontem = repos.guardarJogo({
      chaveNatural: 'teste:ontem',
      competicaoId: competicao.id,
      fase: '1ª FASE',
      serie: 'SÉRIE 1',
      jornada: '0',
      fpfFixtureId: 998,
      fpfMatchId: null,
      dataHora: `${diaDe(-1)}T15:00`,
      clubeCasaId: clubes[0].id,
      clubeForaId: clubes[1].id,
      recintoId: repos.recintoDoClube(clubes[0].id, competicao.id),
      recintoTextoFpf: null,
      estado: 'AGENDADO'
    })
    const hojeCedo = repos.guardarJogo({
      chaveNatural: 'teste:hoje',
      competicaoId: competicao.id,
      fase: '1ª FASE',
      serie: 'SÉRIE 1',
      jornada: '0',
      fpfFixtureId: 997,
      fpfMatchId: null,
      dataHora: `${diaDe(0)}T00:30`,
      clubeCasaId: clubes[0].id,
      clubeForaId: clubes[1].id,
      recintoId: repos.recintoDoClube(clubes[0].id, competicao.id),
      recintoTextoFpf: null,
      estado: 'AGENDADO'
    })
    await nomear({ jogoId: ontem, delegadoId: delegados[1].id, papel: 'PRINCIPAL' })
    const porFazer = repos.listarJogos({ de: repos.inicioDeHoje() })
    verificar(
      'um jogo de ontem sai da lista de trabalho',
      !porFazer.some((j) => j.id === ontem),
      `→ ${porFazer.length} jogos por fazer`
    )
    verificar(
      'um jogo de hoje continua na lista, mesmo com a hora passada',
      porFazer.some((j) => j.id === hojeCedo)
    )
    const doHistorico = repos.historicoJogos()
    verificar(
      'o jogo de ontem com delegado passa ao histórico',
      doHistorico.some((j) => j.id === ontem) && !doHistorico.some((j) => j.id === hojeCedo)
    )

    // Desfazer: o caso que interessa é o clique errado — nomear por cima de
    // alguém, ou remover quem não era para remover.
    const jogoDesfazer = repos.listarJogos().find((j) => j.nomeacoes.length === 0)!
    registarAlteracao(jogoDesfazer.id, 'PRINCIPAL', 'nomeação de teste')
    await nomear({ jogoId: jogoDesfazer.id, delegadoId: delegados[0].id, papel: 'PRINCIPAL' })
    verificar(
      'há uma alteração por desfazer depois de nomear',
      ultimaAccao()?.descricao === 'nomeação de teste',
      `→ ${ultimaAccao()?.descricao ?? 'nenhuma'}`
    )
    desfazerUltimaAccao()
    verificar(
      'desfazer uma nomeação nova deixa o papel livre',
      repos.listarNomeacoesDoJogo(jogoDesfazer.id).every((n) => n.papel !== 'PRINCIPAL'),
      `→ ${repos.listarNomeacoesDoJogo(jogoDesfazer.id).length} nomeações`
    )
    verificar('não há nada para desfazer duas vezes seguidas', ultimaAccao() === null)

    // Nomear por cima de alguém: desfazer tem de repor a pessoa anterior, não
    // deixar o papel vazio.
    await nomear({ jogoId: jogoDesfazer.id, delegadoId: delegados[0].id, papel: 'PRINCIPAL' })
    registarAlteracao(jogoDesfazer.id, 'PRINCIPAL', 'substituição')
    await nomear({ jogoId: jogoDesfazer.id, delegadoId: delegados[1].id, papel: 'PRINCIPAL' })
    desfazerUltimaAccao()
    const anterior = repos.listarNomeacoesDoJogo(jogoDesfazer.id).find((n) => n.papel === 'PRINCIPAL')
    verificar(
      'desfazer uma substituição repõe o delegado anterior',
      anterior?.delegadoId === delegados[0].id,
      `→ ${anterior?.delegadoNome ?? 'ninguém'}`
    )

    // E desfazer uma remoção repõe a nomeação com os km que tinha.
    const kmDaNomeacao = anterior?.km ?? null
    registarAlteracao(jogoDesfazer.id, 'PRINCIPAL', 'remoção')
    repos.removerNomeacao(jogoDesfazer.id, 'PRINCIPAL')
    desfazerUltimaAccao()
    const devolvida = repos.listarNomeacoesDoJogo(jogoDesfazer.id).find((n) => n.papel === 'PRINCIPAL')
    verificar(
      'desfazer uma remoção repõe a nomeação tal como estava',
      devolvida?.delegadoId === delegados[0].id && devolvida?.km === kmDaNomeacao,
      `→ ${devolvida?.delegadoNome ?? 'ninguém'}, ${devolvida?.km ?? '—'} km`
    )
    repos.removerNomeacao(jogoDesfazer.id, 'PRINCIPAL')
    esquecerUltimaAccao()

    // Repetições de clube: contam-se por par clube/competição. O mesmo clube
    // noutra competição não é repetição — são equipas e escalões diferentes.
    const segundaCompeticao = repos.guardarCompeticao({
      fpfCompetitionId: 29442,
      seasonId: 106,
      seasonDescricao: '2026-2027',
      nome: 'LIGA 3 DE TESTE',
      organizacao: 'Competições FPF',
      ativa: false,
      nivelMinimo: null,
      usaDelegadoCampo: true
    })
    const delegadoRepetidor = delegados[0]
    // Um clube só deste cenário: o delegado já tem nomeações de outros clubes
    // das secções anteriores, e com um clube partilhado os números do teste
    // dependiam do que veio antes.
    const clubeDoTeste = repos.encontrarOuCriarClube('Clube Só Para Repetições')
    const criarJogoPara = (chave: string, competicaoId: number, dia: string): number =>
      repos.guardarJogo({
        chaveNatural: chave,
        competicaoId,
        fase: null,
        serie: null,
        jornada: null,
        fpfFixtureId: null,
        fpfMatchId: null,
        dataHora: `${dia}T15:00`,
        clubeCasaId: clubeDoTeste.id,
        clubeForaId: clubes[2].id,
        recintoId: repos.recintoDoClube(clubes[0].id, competicaoId),
        recintoTextoFpf: null,
        estado: 'AGENDADO'
      })

    // Duas visitas ao mesmo clube na mesma competição: é repetição.
    for (const [i, dia] of ['2026-10-04', '2026-10-11'].entries()) {
      const id = criarJogoPara(`teste:rep${i}`, competicao.id, dia)
      await nomear({ jogoId: id, delegadoId: delegadoRepetidor.id, papel: 'PRINCIPAL' })
    }
    // E uma terceira ao mesmo clube, mas noutra competição: não conta.
    const noutraCompeticao = criarJogoPara('teste:rep-outra', segundaCompeticao.id, '2026-10-18')
    await nomear({ jogoId: noutraCompeticao, delegadoId: delegadoRepetidor.id, papel: 'PRINCIPAL' })

    const repeticoes = repos.repeticoesPorDelegado()
    const doRepetidor = repeticoes.find((l) => l.delegadoId === delegadoRepetidor.id)!
    const nesteClube = doRepetidor.repeticoes.filter((r) => r.clubeId === clubeDoTeste.id)
    verificar(
      'conta as repetições por clube e competição',
      nesteClube.length === 1 && nesteClube[0].vezes === 2,
      `→ ${nesteClube.map((r) => `${r.clubeNome} ${r.vezes}× (${r.competicaoNome})`).join(', ') || 'nenhuma'}`
    )
    verificar(
      'o mesmo clube noutra competição não conta como repetição',
      // Três jogos deste clube ao todo, mas só dois na mesma competição: se a
      // contagem fosse por clube, dariam 3× numa linha só.
      !doRepetidor.repeticoes.some((r) => r.competicaoId === segundaCompeticao.id) &&
        nesteClube.every((r) => r.vezes === 2),
      `→ ${doRepetidor.repeticoes
        .map((r) => `${r.clubeNome} ${r.vezes}× (${r.competicaoNome})`)
        .join(', ')}`
    )
    verificar(
      'quem só foi uma vez a cada clube não aparece com repetições',
      repeticoes.every((l) => l.repeticoes.every((r) => r.vezes >= 2))
    )
    verificar(
      'todos os delegados ativos aparecem na tabela, com ou sem repetições',
      repeticoes.length === repos.listarDelegados(false).length,
      `→ ${repeticoes.length} linhas`
    )

    // Recinto sem coordenadas: tem de dar alerta, e o alerta tem de fechar-se
    // sozinho quando alguém puser a localização.
    const orfao = repos.encontrarOuCriarRecinto('Campo Sem Coordenadas Nenhumas')
    const criados = repos.criarAlertas(repos.alertasDeRecintosSemCoordenadas())
    verificar(
      'um recinto sem coordenadas gera alerta',
      criados.some((a) => a.tipo === 'RECINTO_SEM_COORDENADAS' && a.recintoId === orfao.id),
      `→ ${criados.length} alerta(s)`
    )
    verificar(
      'o mesmo recinto não gera alertas repetidos',
      repos.criarAlertas(repos.alertasDeRecintosSemCoordenadas()).length === 0
    )
    repos.atualizarRecinto(orfao.id, {
      nome: orfao.nome,
      morada: 'algures',
      lat: 41.1,
      lng: -8.6,
      coordsManuais: true
    })
    const fechados = repos.apagarAlertasDeRecintosLocalizados()
    verificar(
      'o alerta fecha-se quando o recinto passa a ter coordenadas',
      fechados === 1 &&
        !repos.listarAlertas().some((a) => a.tipo === 'RECINTO_SEM_COORDENADAS' && a.recintoId === orfao.id)
    )

    log('\n8. Endpoints reais da FPF')
    try {
      const cliente = new ClienteFpf({ baseUrl: 'https://resultados.fpf.pt', intervaloMs: 400 })
      const indice = await cliente.indiceCompeticoes()
      const epocas = parseEpocas(indice)
      verificar('índice acessível (Cloudflare ultrapassado)', epocas.length > 5, `→ ${epocas.length} épocas`)

      const fpf = parseOrganizacoes(indice).find((o) => o.nome === 'Competições FPF')
      verificar('organização "Competições FPF" encontrada', !!fpf, `→ ${fpf?.competicoes.length} competições`)

      const cp = fpf?.competicoes.find((c) => /CAMPEONATO DE PORTUGAL/i.test(c.nome))
      if (cp) {
        const detalhes = parseDetalhesCompeticao(
          await cliente.detalhesCompeticao(cp.competitionId, epocas[0].seasonId)
        )
        const totalJornadas = detalhes.fases.flatMap((f) => f.series).flatMap((s) => s.jornadas).length
        verificar('estrutura de fases/séries/jornadas lida', totalJornadas > 20, `→ ${totalJornadas} jornadas`)

        const primeira = detalhes.fases[0]?.series[0]?.jornadas.find((j) => j.atual) ?? detalhes.fases[0]?.series[0]?.jornadas[0]
        if (primeira) {
          const jogos = parseJogosJornada(await cliente.jogosDaJornada(primeira.fixtureId))
          verificar('jogos da jornada lidos', jogos.length > 0, `→ ${jogos.length} jogos`)
          verificar(
            'cada jogo traz equipas e recinto',
            jogos.every((j) => j.clubeCasa && j.clubeFora),
            `→ ex.: ${jogos[0]?.clubeCasa} × ${jogos[0]?.clubeFora} em ${jogos[0]?.recinto ?? '?'} (${jogos[0]?.dataTexto} ${jogos[0]?.horaTexto ?? ''})`
          )
        }
      }

      log('\n9. Sincronização real (o fluxo que o coordenador usa)')
      const antesJogos = repos.listarJogos().length
      const antesClubes = repos.listarClubes().length

      const resultado = await sincronizar(
        cliente,
        {
          seasonId: epocas[0].seasonId,
          descricaoEpoca: epocas[0].descricao,
          organizacao: 'Competições FPF',
          // A Taça é por eliminatórias (jogos na própria página) e a Liga 3
          // devolvia a página de desafio do Cloudflare: os dois casos que
          // faziam a importação acabar em silêncio.
          competicoes: [29523, 29442]
            .map((id) => fpf?.competicoes.find((c) => c.competitionId === id))
            .filter((c): c is NonNullable<typeof c> => !!c)
            .map((c) => ({ competitionId: c.competitionId, nome: c.nome, nivelMinimo: null, usaDelegadoCampo: true }))
        },
        () => undefined
      )

      const jogosNovos = repos.listarJogos().length - antesJogos
      const clubesNovos = repos.listarClubes().length - antesClubes

      verificar(
        'a sincronização grava os jogos sem passo extra',
        jogosNovos > 0,
        `→ ${jogosNovos} jogos, ${resultado.criados} reportados como criados`
      )
      verificar(
        'os clubes das competições são criados automaticamente',
        clubesNovos > 0,
        `→ ${clubesNovos} clubes, ex.: ${resultado.clubesCriados.slice(0, 3).join(', ')}`
      )
      verificar(
        'competições por eliminatórias trazem jogos',
        (resultado.competicoes.find((c) => /TA.A DE PORTUGAL/i.test(c.nome))?.jogos ?? 0) > 0,
        `→ ${resultado.competicoes.map((c) => `${c.nome}: ${c.jogos}`).join(' | ')}`
      )
      verificar('sem erros na sincronização', resultado.erros.length === 0, resultado.erros.join(' || '))

      const comRecinto = repos.listarJogos().filter((j) => j.recintoId != null).length
      verificar(
        'os jogos ficam com recinto associado',
        comRecinto > 0,
        `→ ${comRecinto} de ${repos.listarJogos().length}`
      )
      if (cliente.recorreuAJanela) {
        log('    (foi preciso recorrer à janela oculta para passar o Cloudflare)')
      }
    } catch (erro) {
      log(`  ${vermelho('!')} sem acesso ao site da FPF: ${(erro as Error).message}`)
      log('    (a aplicação continua a funcionar com importação manual)')
    }

    log('\n10. Alertas de alteração e conflito')
    const margem = 180
    const jogoBase = repos.listarJogos().find((j) => j.nomeacoes.length > 0)
    verificar('há um jogo nomeado para testar colisões', !!jogoBase)
    if (jogoBase) {
      const delegadoNomeado = jogoBase.nomeacoes[0].delegadoId

      // Outro jogo do mesmo delegado, duas horas depois: é o cenário do
      // adiamento que cai em cima de uma nomeação que já existia.
      const outroId = repos.guardarJogo({
        chaveNatural: 'teste:colisao',
        competicaoId: jogoBase.competicaoId,
        fase: null,
        serie: null,
        jornada: null,
        fpfFixtureId: null,
        fpfMatchId: null,
        dataHora: '2026-09-13T17:00',
        clubeCasaId: jogoBase.clubeForaId,
        clubeForaId: jogoBase.clubeCasaId,
        recintoId: jogoBase.recintoId,
        recintoTextoFpf: null,
        estado: 'AGENDADO'
      })
      await nomear({ jogoId: outroId, delegadoId: delegadoNomeado, papel: 'PRINCIPAL' })

      const colisoes = repos.jogosDoDelegadoPerto(delegadoNomeado, '2026-09-13T16:00', margem, jogoBase.id)
      verificar(
        'deteta que o delegado já tem outro jogo na nova data',
        colisoes.some((c) => c.id === outroId),
        `→ ${colisoes.length} colisões`
      )
      verificar(
        'não acusa colisão fora da margem',
        repos.jogosDoDelegadoPerto(delegadoNomeado, '2026-09-13T23:00', margem, jogoBase.id).length === 0
      )
    }

    const alertas = repos.criarAlertas([
      {
        chave: 'teste:alerta:1',
        tipo: 'ALTERADO',
        jogoId: null,
        competicao: 'Competição de Teste',
        descricao: 'A × B',
        dataHora: '2026-09-13T15:00',
        detalhe: 'data passou de 13/09 para 20/09'
      }
    ])
    verificar('grava alertas', alertas.length === 1)
    verificar(
      'não repete o mesmo alerta em atualizações seguintes',
      repos.criarAlertas([
        {
          chave: 'teste:alerta:1',
          tipo: 'ALTERADO',
          jogoId: null,
          competicao: 'Competição de Teste',
          descricao: 'A × B',
          dataHora: '2026-09-13T15:00',
          detalhe: 'data passou de 13/09 para 20/09'
        }
      ]).length === 0
    )
    log('\n11. Importação por ficheiro (recurso sem dependências)')
    const clubesAntesCsv = repos.listarClubes().length
    const csv = [
      'Competicao;Jornada;Data;Hora;Casa;Fora;Recinto',
      'TAÇA DE TESTE;1;20/09/2026;16:00;Clube Novo A;Clube Novo B;Campo de Teste',
      'TAÇA DE TESTE;1;20/09/2026;18:00;"Clube, Com Vírgula";Clube Novo A;Campo de Teste',
      'TAÇA DE TESTE;1;data inválida;;X;Y;'
    ].join('\n')
    const importado = importarCsv(csv, 106, '2026-2027')
    verificar('importa as linhas válidas', importado.criados === 2, `→ ${importado.criados} jogos`)
    verificar('reporta a linha inválida sem perder as outras', importado.erros.length === 1)
    verificar(
      'cria competições e clubes que não existiam',
      importado.competicoesCriadas.includes('TAÇA DE TESTE') && repos.listarClubes().length > clubesAntesCsv,
      `→ ${importado.clubesCriados.length} clubes`
    )
    verificar(
      'o recinto do ficheiro fica associado ao jogo',
      repos.listarJogos({ competicaoId: importado.criados > 0 ? repos.listarCompeticoes(106).find((c) => c.nome === 'TAÇA DE TESTE')!.id : 0 })
        .every((j) => j.recintoNome === 'Campo de Teste')
    )
    verificar(
      'reimportar o mesmo ficheiro não duplica jogos',
      importarCsv(csv, 106, '2026-2027').criados === 0
    )

    verificar('lista os alertas por ler', repos.listarAlertas(true).length === 1)
    repos.marcarTodosAlertasLidos()
    verificar('marcar como lido limpa a lista de por ler', repos.listarAlertas(true).length === 0)

    log('\n12. Recintos localizados sozinhos após a atualização')
    // Sem competições ativas a sincronização não faz nada, o que deixa este
    // teste rápido e prova que os recintos são tratados na mesma.
    for (const comp of repos.listarCompeticoes()) {
      repos.guardarCompeticao({ ...comp, ativa: false })
    }
    const semCoords = repos.encontrarOuCriarRecinto('Campo Da Mata')
    verificar('há um recinto por localizar', repos.recintosSemCoordenadas().length >= 1)

    const atualizacao = await atualizarJogos(new ClienteFpf({ baseUrl: 'https://resultados.fpf.pt' }))
    verificar(
      'a atualização localiza os recintos sem que ninguém carregue num botão',
      atualizacao.recintosLocalizados >= 1,
      `→ ${atualizacao.recintosLocalizados} localizados`
    )
    const corrigido = repos.obterRecinto(semCoords.id)
    verificar(
      'a correção confirmada é aplicada sem consultar ninguém',
      corrigido?.lat != null && Math.abs(corrigido.lat - 39.4034078) < 0.001,
      `→ ${corrigido?.lat}, ${corrigido?.lng} (${corrigido?.morada})`
    )
    verificar('fica marcado como confirmado', corrigido?.confirmado === true)

    log('\n13. Limpar as nomeações (dados de teste)')
    // Apagar as nomeações (limpeza dos dados de teste) só pode levar as
    // nomeações — delegados, clubes, recintos e jogos ficam.
    const antesDeApagar = {
      nomeacoes: repos.contarNomeacoes(),
      delegados: repos.listarDelegados(true).length,
      jogos: repos.listarJogos().length,
      clubes: repos.listarClubes().length,
      recintos: repos.listarRecintos().length
    }
    // Sem isto, a verificação dos km a seguir seria vazia: `estatisticasPorDelegado`
    // só devolve linhas para quem tem nomeações, por isso depois de apagar o
    // mapa fica vazio e qualquer `every` passa sem testar nada.
    const kmAntes = [...repos.estatisticasPorDelegado().values()].map((e) => e.km)
    verificar('há nomeações para apagar antes do teste', antesDeApagar.nomeacoes > 0, `→ ${antesDeApagar.nomeacoes}`)
    verificar(
      'e há km acumulados que têm de desaparecer',
      kmAntes.some((km) => km > 0),
      `→ ${kmAntes.map((km) => Math.round(km)).join(', ') || 'nenhum'} km`
    )
    const apagadas = repos.apagarTodasNomeacoes()
    verificar(
      'apagar nomeações leva todas',
      apagadas === antesDeApagar.nomeacoes && repos.contarNomeacoes() === 0,
      `→ ${apagadas} apagadas`
    )
    verificar(
      'apagar nomeações não mexe em delegados, jogos, clubes nem recintos',
      repos.listarDelegados(true).length === antesDeApagar.delegados &&
        repos.listarJogos().length === antesDeApagar.jogos &&
        repos.listarClubes().length === antesDeApagar.clubes &&
        repos.listarRecintos().length === antesDeApagar.recintos
    )
    const kmDepois = [...repos.estatisticasPorDelegado().values()].map((e) => e.km)
    verificar(
      'os km da época voltam a zero',
      kmDepois.every((km) => km === 0),
      `→ ${kmAntes.filter((km) => km > 0).length} delegados com km antes, ${kmDepois.filter((km) => km > 0).length} depois`
    )
    verificar('o histórico fica vazio depois de apagar', repos.historicoJogos().length === 0)

    log('\n14. Repor uma cópia de segurança')
    // Repor tem de trazer de volta o estado exato da cópia, e o estado de agora
    // tem de ficar guardado — repor também é uma decisão que se pode desfazer.
    const antesDaCopia = repos.listarDelegados(true).length
    const copiaEscolhida = listarCopiasSeguranca(pastaCopias)[0]
    repos.criarDelegado({
      numero: '9999',
      nome: 'Delegado Depois Da Cópia',
      morada: null,
      lat: 40,
      lng: -8,
      nivel: 'PRINCIPAL',
      telefone: null,
      email: null,
      ativo: true,
      notas: null,
      coordsManuais: true
    })
    const copiasAntesDeRepor = listarCopiasSeguranca(pastaCopias).length
    verificar(
      'há uma cópia para repor e um estado diferente do dela',
      !!copiaEscolhida && repos.listarDelegados(true).length === antesDaCopia + 1,
      `→ ${copiaEscolhida?.ficheiro ?? 'nenhuma'}`
    )

    reporCopiaSeguranca(copiaEscolhida.caminho, caminho, pastaCopias)
    verificar(
      'repor devolve a base de dados ao estado da cópia',
      !repos.listarDelegados(true).some((d) => d.numero === '9999'),
      `→ ${repos.listarDelegados(true).length} delegados`
    )
    verificar(
      'o estado anterior à reposição fica guardado como cópia',
      listarCopiasSeguranca(pastaCopias).length > copiasAntesDeRepor,
      `→ ${listarCopiasSeguranca(pastaCopias).length} cópias`
    )
    verificar(
      'a base de dados fica utilizável a seguir a repor',
      repos.listarJogos().length >= 0 && repos.contarNomeacoes() >= 0
    )
    // Um caminho que não seja uma cópia da aplicação não pode substituir nada.
    let recusouReposicao = ''
    try {
      reporCopiaSeguranca(join(pasta, 'data', 'teste.db'), caminho, pastaCopias)
    } catch (erro) {
      recusouReposicao = (erro as Error).message
    }
    verificar(
      'recusa repor a partir de um ficheiro que não é uma cópia',
      recusouReposicao.includes('cópias de segurança criadas pela aplicação'),
      `→ ${recusouReposicao || 'aceitou'}`
    )

  } finally {
    // O SQLite ainda tem o ficheiro aberto; se o Windows o bloquear, a pasta
    // temporária fica para trás e não vale a pena falhar a verificação por isso.
    try {
      rmSync(pasta, { recursive: true, force: true })
    } catch {
      /* pasta temporária, o sistema limpa-a depois */
    }
  }

  log(falhas === 0 ? `\n${verde('Verificação concluída sem falhas.')}\n` : `\n${vermelho(`${falhas} verificações falharam.`)}\n`)
  app.exit(falhas === 0 ? 0 : 1)
}

app.whenReady().then(principal)
