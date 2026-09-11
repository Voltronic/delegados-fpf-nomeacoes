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
import { MIGRACOES } from './db/schema'
import { semearRecintos } from './db/semente'
import { exportarDelegados, importarDelegados } from './delegados/servico'
import { normalizarNome } from './fpf/html'
import { limiteDeTrabalho } from '../shared/datas'
import { alertasDeAlteracao } from './sync/agendador'
import { obterTrajeto } from './geo'
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

    // A reparação das horas apagadas pelos jogos já realizados. Testa-se o SQL
    // da migração tal como ele corre nas bases de dados existentes, sobre uma
    // tabela com os casos que interessam.
    const reparacao = new Database(join(pasta, 'data', 'reparacao.db'))
    reparacao.exec('CREATE TABLE jogo (id INTEGER PRIMARY KEY, data_hora TEXT, ultima_alteracao TEXT)')
    const casos = [
      // O caso real: hora apagada no mesmo dia. Tem de voltar às 12:00.
      [1, '2026-09-09T00:00', 'data 2026-09-09 às 12:00 → 2026-09-09 às 00:00'],
      // Adiado mesmo para outro dia, ainda sem hora: não se inventa nada.
      [2, '2026-09-20T00:00', 'data 2026-09-09 às 12:00 → 2026-09-20 às 00:00'],
      // Jogo que nunca teve hora: nada a repor.
      [3, '2026-09-13T00:00', 'data 2026-09-13 às 00:00 → 2026-09-13 às 00:00'],
      // Alteração normal, com hora dos dois lados: não se toca.
      [4, '2026-09-13T17:00', 'data 2026-09-13 às 15:00 → 2026-09-13 às 17:00'],
      // Recinto alterado: texto diferente, fora do alcance da reparação.
      [5, '2026-09-14T00:00', 'recinto Campo A → Campo B']
    ]
    const inserirCaso = reparacao.prepare('INSERT INTO jogo (id, data_hora, ultima_alteracao) VALUES (?, ?, ?)')
    for (const [id, data, alteracao] of casos) inserirCaso.run(id, data, alteracao)

    reparacao.exec(MIGRACOES.find((m) => m.versao === 10)!.sql)
    const depois = new Map(
      (reparacao.prepare('SELECT id, data_hora, ultima_alteracao FROM jogo').all() as {
        id: number
        data_hora: string
        ultima_alteracao: string | null
      }[]).map((l) => [l.id, l])
    )
    reparacao.close()

    verificar(
      'a reparação devolve a hora que a FPF apagou',
      depois.get(1)?.data_hora === '2026-09-09T12:00' && depois.get(1)?.ultima_alteracao === null,
      `→ ${depois.get(1)?.data_hora}, alteração ${depois.get(1)?.ultima_alteracao ?? 'limpa'}`
    )
    verificar(
      'não mexe num jogo que mudou mesmo de dia',
      depois.get(2)?.data_hora === '2026-09-20T00:00' && depois.get(2)?.ultima_alteracao !== null
    )
    verificar('não inventa hora onde nunca houve', depois.get(3)?.data_hora === '2026-09-13T00:00')
    verificar('não toca numa alteração de hora normal', depois.get(4)?.data_hora === '2026-09-13T17:00')
    verificar('não toca numa alteração de recinto', depois.get(5)?.data_hora === '2026-09-14T00:00')

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
      usaDelegadoCampo: true,
      todosComDelegado: true
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
    // Competições em que só alguns jogos levam delegado — a Taça é o caso real.
    // Os jogos dessas ficam fora da lista de trabalho até serem escolhidos.
    const taca = repos.guardarCompeticao({
      fpfCompetitionId: 29999,
      seasonId: 106,
      seasonDescricao: '2026-2027',
      nome: 'TAÇA DE TESTE SEM DELEGADO FIXO',
      organizacao: 'Competições FPF',
      ativa: true,
      nivelMinimo: null,
      usaDelegadoCampo: false,
      todosComDelegado: false
    })
    const jogoDaTaca = repos.guardarJogo({
      chaveNatural: 'teste:taca',
      competicaoId: taca.id,
      fase: null,
      serie: null,
      jornada: null,
      fpfFixtureId: null,
      fpfMatchId: null,
      dataHora: '2026-10-25T15:00',
      clubeCasaId: clubes[0].id,
      clubeForaId: clubes[1].id,
      recintoId: repos.recintoDoClube(clubes[0].id, taca.id),
      recintoTextoFpf: null,
      estado: 'AGENDADO'
    })

    verificar(
      'os jogos de competições sem delegado fixo ficam fora da lista',
      !repos.listarJogos().some((j) => j.id === jogoDaTaca),
      `→ ${repos.listarJogos().length} jogos na lista`
    )
    verificar(
      'mas encontram-se quando se pedem à parte',
      repos.listarJogos({ levaDelegado: 'SEM' }).some((j) => j.id === jogoDaTaca)
    )

    repos.definirLevaDelegado(jogoDaTaca, true)
    verificar(
      'marcar um jogo trá-lo para a lista de nomeações',
      repos.listarJogos().some((j) => j.id === jogoDaTaca) &&
        !repos.listarJogos({ levaDelegado: 'SEM' }).some((j) => j.id === jogoDaTaca)
    )

    repos.definirLevaDelegado(jogoDaTaca, null)
    verificar(
      'e desmarcar devolve-o à regra da competição',
      !repos.listarJogos().some((j) => j.id === jogoDaTaca)
    )

    // A decisão do coordenador não pode ser desfeita por uma resincronização.
    repos.guardarCompeticao({ ...taca, todosComDelegado: true })
    repos.guardarCompeticao({
      fpfCompetitionId: taca.fpfCompetitionId,
      seasonId: taca.seasonId,
      seasonDescricao: taca.seasonDescricao,
      nome: taca.nome,
      organizacao: taca.organizacao,
      ativa: true,
      nivelMinimo: null,
      usaDelegadoCampo: false,
      todosComDelegado: false
    })
    verificar(
      'resincronizar não desfaz a definição da competição',
      repos.listarCompeticoes().find((c) => c.id === taca.id)?.todosComDelegado === true
    )
    repos.guardarCompeticao({ ...taca, todosComDelegado: false })

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
    // Na prática só o principal vai a quase todos os jogos; o delegado de campo
    // é a exceção e é o coordenador que decide, jogo a jogo.
    verificar(
      'a proposta automática sugere só o delegado principal',
      proposta.every((p) => p.principal && !p.campo),
      `→ ${proposta.filter((p) => p.campo).length} com delegado de campo`
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
    await nomear({ jogoId: passado, delegadoId: delegados[0].id, papel: 'PRINCIPAL' })
    const historico = repos.historicoJogos()
    verificar(
      'um jogo passado com delegado entra no histórico',
      historico.some((j) => j.id === passado),
      `→ ${historico.length} no histórico`
    )
    verificar(
      'o histórico não mostra jogos que ainda estão para acontecer',
      historico.every((j) => (j.dataHora ?? '') < new Date().toISOString().slice(0, 16))
    )

    // A fronteira do trabalho: um jogo continua na lista durante as horas em
    // que ainda se pode estar a jogar, e só depois passa a histórico.
    const horasDaqui = (horas: number): string => {
      const d = new Date()
      d.setHours(d.getHours() + horas)
      const p2 = (n: number): string => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
    }
    const jogoEm = (chave: string, quando: string): number =>
      repos.guardarJogo({
        chaveNatural: chave,
        competicaoId: competicao.id,
        fase: null,
        serie: null,
        jornada: null,
        fpfFixtureId: null,
        fpfMatchId: null,
        dataHora: quando,
        clubeCasaId: clubes[0].id,
        clubeForaId: clubes[1].id,
        recintoId: repos.recintoDoClube(clubes[0].id, competicao.id),
        recintoTextoFpf: null,
        estado: 'AGENDADO'
      })

    // Começou há duas horas: ainda pode estar a decorrer.
    const aDecorrer = jogoEm('teste:adecorrer', horasDaqui(-2))
    // Começou há cinco: já acabou de certeza.
    const acabado = jogoEm('teste:acabado', horasDaqui(-5))
    await nomear({ jogoId: acabado, delegadoId: delegados[1].id, papel: 'PRINCIPAL' })

    const porFazer = repos.listarJogos({ de: limiteDeTrabalho() })
    verificar(
      'um jogo que começou há duas horas continua na lista',
      porFazer.some((j) => j.id === aDecorrer),
      `→ ${porFazer.length} jogos por fazer`
    )
    verificar(
      'um jogo que começou há cinco horas sai da lista',
      !porFazer.some((j) => j.id === acabado)
    )
    const doHistorico = repos.historicoJogos()
    verificar(
      'e passa ao histórico',
      doHistorico.some((j) => j.id === acabado) && !doHistorico.some((j) => j.id === aDecorrer),
      `→ ${doHistorico.length} no histórico`
    )

    // Nas competições em que todos os jogos levam delegado, um jogo que passou
    // sem ninguém nomeado é precisamente o que interessa ver no histórico.
    const passadoSemNinguem = jogoEm('teste:passado-sem-delegado', horasDaqui(-6))
    verificar(
      'um jogo passado sem delegado entra no histórico quando a competição exige delegado',
      repos.historicoJogos().some((j) => j.id === passadoSemNinguem)
    )

    // Nas outras, só entra o que o coordenador escolheu.
    const semDelegadoFixo = repos.guardarCompeticao({
      fpfCompetitionId: 29998,
      seasonId: 106,
      seasonDescricao: '2026-2027',
      nome: 'TAÇA SÓ COM ESCOLHIDOS',
      organizacao: 'Competições FPF',
      ativa: true,
      nivelMinimo: null,
      usaDelegadoCampo: false,
      todosComDelegado: false
    })
    const daTaca = repos.guardarJogo({
      chaveNatural: 'teste:taca-passada',
      competicaoId: semDelegadoFixo.id,
      fase: null,
      serie: null,
      jornada: null,
      fpfFixtureId: null,
      fpfMatchId: null,
      dataHora: horasDaqui(-8),
      clubeCasaId: clubes[0].id,
      clubeForaId: clubes[1].id,
      recintoId: repos.recintoDoClube(clubes[0].id, semDelegadoFixo.id),
      recintoTextoFpf: null,
      estado: 'REALIZADO'
    })
    verificar(
      'um jogo de competição sem delegado fixo não entra no histórico',
      !repos.historicoJogos().some((j) => j.id === daTaca)
    )
    repos.definirLevaDelegado(daTaca, true)
    verificar(
      'a não ser que tenha sido escolhido para nomeação',
      repos.historicoJogos().some((j) => j.id === daTaca)
    )

    // Contagem de deslocações de avião por delegado. É o número que diz onde
    // está o custo verdadeiro: um voo pesa muito mais do que os km mostram.
    const recintoIlha = repos.encontrarOuCriarRecinto('Estádio de São Miguel')
    repos.atualizarRecinto(recintoIlha.id, {
      nome: recintoIlha.nome,
      morada: null,
      lat: 37.747,
      lng: -25.651,
      coordsManuais: true
    })
    const jogoNaIlha = repos.guardarJogo({
      chaveNatural: 'teste:ilha',
      competicaoId: competicao.id,
      fase: null,
      serie: null,
      jornada: null,
      fpfFixtureId: null,
      fpfMatchId: null,
      dataHora: '2026-11-15T15:00',
      clubeCasaId: clubes[0].id,
      clubeForaId: clubes[1].id,
      recintoId: recintoIlha.id,
      recintoTextoFpf: null,
      estado: 'AGENDADO'
    })
    // O delegado é do continente: para ir a São Miguel tem de voar.
    const doContinente = delegados[0]
    await nomear({ jogoId: jogoNaIlha, delegadoId: doContinente.id, papel: 'PRINCIPAL' })

    const comVoos = repos.tabelaKm().find((l) => l.delegadoId === doContinente.id)!
    verificar(
      'conta as deslocações de avião de cada delegado',
      comVoos.voos >= 1,
      `→ ${comVoos.voos} voos, ${comVoos.jogos} jogos`
    )
    const semVoos = repos.tabelaKm().find((l) => l.delegadoId !== doContinente.id && l.jogos > 0)
    verificar(
      'quem só viaja por estrada fica a zero voos',
      !semVoos || semVoos.voos === 0,
      `→ ${semVoos?.voos ?? 0} voos em ${semVoos?.nome ?? 'ninguém'}`
    )
    verificar(
      'o voo conta como jogo mas não infla os km com a distância aérea',
      comVoos.km < 1000,
      `→ ${comVoos.km} km`
    )

    // Corrigir quem foi a um jogo já realizado. Sem isto, um engano ficava a
    // contar km ao delegado errado até ao fim da época.
    const noHistorico = repos.historicoJogos()[0]
    const antesDaTroca = noHistorico.nomeacoes.find((n) => n.papel === 'PRINCIPAL')!
    const outroDelegado = delegados.find((d) => d.id !== antesDaTroca.delegadoId)!
    await nomear({
      jogoId: noHistorico.id,
      delegadoId: outroDelegado.id,
      papel: 'PRINCIPAL'
    })
    const jogoCorrigido = repos.obterJogoDetalhado(noHistorico.id)!
    const agoraPrincipal = jogoCorrigido.nomeacoes.find((n) => n.papel === 'PRINCIPAL')!
    verificar(
      'dá para trocar o delegado de um jogo já realizado',
      agoraPrincipal.delegadoId === outroDelegado.id &&
        jogoCorrigido.nomeacoes.filter((n) => n.papel === 'PRINCIPAL').length === 1,
      `→ ${antesDaTroca.delegadoNome} para ${agoraPrincipal.delegadoNome}`
    )
    verificar(
      'e os km passam a ser os de quem passou a constar',
      agoraPrincipal.km !== antesDaTroca.km,
      `→ ${antesDaTroca.km} km para ${agoraPrincipal.km} km`
    )
    const estatisticas = repos.estatisticasPorDelegado()
    verificar(
      'os km da época seguem a correção',
      (estatisticas.get(outroDelegado.id)?.km ?? 0) > 0,
      `→ ${estatisticas.get(outroDelegado.id)?.km ?? 0} km em ${outroDelegado.nome}`
    )
    // Repor o estado anterior, para as verificações seguintes.
    await nomear({ jogoId: noHistorico.id, delegadoId: antesDaTroca.delegadoId, papel: 'PRINCIPAL' })

    // Editar um jogo à mão: as nomeações ficam, a FPF deixa de lhe tocar, e o
    // que mudou fica registado para aparecer no cartão.
    const paraEditar = repos.listarJogos().find((j) => j.nomeacoes.length > 0)!
    const nomeacoesAntes = paraEditar.nomeacoes.length
    const editado = repos.editarJogo(paraEditar.id, {
      dataHora: '2026-11-30T20:45',
      recintoId: paraEditar.recintoId,
      jornada: paraEditar.jornada
    })!
    verificar(
      'editar guarda a data nova e mantém as nomeações',
      editado.dataHora === '2026-11-30T20:45' && editado.nomeacoes.length === nomeacoesAntes,
      `→ ${editado.dataHora}, ${editado.nomeacoes.length} nomeações`
    )
    verificar(
      'o jogo diz o que mudou',
      (editado.ultimaAlteracao ?? '').includes('data'),
      `→ ${editado.ultimaAlteracao ?? 'nada'}`
    )
    verificar('e fica marcado como corrigido à mão', editado.editadoManualmente)

    // A sincronização não pode desfazer a correção.
    repos.guardarJogo({
      chaveNatural: editado.chaveNatural,
      competicaoId: editado.competicaoId,
      fase: editado.fase,
      serie: editado.serie,
      jornada: editado.jornada,
      fpfFixtureId: editado.fpfFixtureId,
      fpfMatchId: editado.fpfMatchId,
      dataHora: '2026-12-25T10:00',
      clubeCasaId: editado.clubeCasaId,
      clubeForaId: editado.clubeForaId,
      recintoId: editado.recintoId,
      recintoTextoFpf: editado.recintoTextoFpf,
      estado: editado.estado
    })
    verificar(
      'a atualização automática não mexe num jogo corrigido à mão',
      repos.obterJogoDetalhado(editado.id)?.dataHora === '2026-11-30T20:45',
      `→ ${repos.obterJogoDetalhado(editado.id)?.dataHora}`
    )

    // E voltar a seguir a FPF devolve o jogo às atualizações.
    repos.seguirFpfDeNovo(editado.id)
    repos.guardarJogo({
      chaveNatural: editado.chaveNatural,
      competicaoId: editado.competicaoId,
      fase: editado.fase,
      serie: editado.serie,
      jornada: editado.jornada,
      fpfFixtureId: editado.fpfFixtureId,
      fpfMatchId: editado.fpfMatchId,
      dataHora: '2026-12-25T10:00',
      clubeCasaId: editado.clubeCasaId,
      clubeForaId: editado.clubeForaId,
      recintoId: editado.recintoId,
      recintoTextoFpf: editado.recintoTextoFpf,
      estado: editado.estado
    })
    const depoisDeSeguir = repos.obterJogoDetalhado(editado.id)
    verificar(
      'voltar a seguir a FPF devolve o jogo às atualizações',
      depoisDeSeguir?.dataHora === '2026-12-25T10:00',
      `→ ${depoisDeSeguir?.dataHora}`
    )
    verificar(
      'e a alteração vinda da FPF também fica descrita',
      (depoisDeSeguir?.ultimaAlteracao ?? '').includes('30'),
      `→ ${depoisDeSeguir?.ultimaAlteracao ?? 'nada'}`
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
      usaDelegadoCampo: true,
      todosComDelegado: true
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

    // Uma alteração de hora avisa mesmo que ninguém esteja nomeado: muda quem
    // pode ir ao jogo, e antes só se avisava sobre jogos já nomeados.
    // Um jogo criado para este cenário: escolher um qualquer da lista dava um
    // jogo do passado, que as regras filtram — e o teste falhava por isso.
    const idSemDelegado = jogoEm('teste:sem-delegado', horasDaqui(72))
    const semDelegado = repos.obterJogoDetalhado(idSemDelegado)!
    const alertaSemDelegado = repos.criarAlertas(
      alertasDeAlteracao([
        {
          tipo: 'ALTERADO',
          chaveNatural: semDelegado.chaveNatural,
          competicaoNome: semDelegado.competicaoNome,
          clubeCasa: semDelegado.clubeCasaNome,
          clubeFora: semDelegado.clubeForaNome,
          jornada: semDelegado.jornada,
          dataHora: semDelegado.dataHora,
          recinto: semDelegado.recintoNome,
          alteracoes: [
            { campo: 'Data e hora', antes: '2026-09-19T15:00', depois: semDelegado.dataHora }
          ],
          temNomeacoes: false,
          jogoId: semDelegado.id
        }
      ])
    )
    verificar(
      'uma alteração num jogo sem delegado também avisa',
      alertaSemDelegado.length === 1,
      `→ ${alertaSemDelegado[0]?.detalhe ?? 'sem alerta'}`
    )
    verificar(
      'e o aviso diz que o jogo ainda não tem delegado',
      (alertaSemDelegado[0]?.detalhe ?? '').includes('sem delegado nomeado')
    )

    // Regras dos alertas: nada sobre jogos que já começaram, e nada repetido —
    // nem depois de o coordenador apagar o alerta.
    const daquiA = (horas: number): string => {
      const d = new Date()
      d.setHours(d.getHours() + horas)
      const p2 = (n: number): string => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
    }
    const base = {
      tipo: 'ALTERADO' as const,
      jogoId: null,
      recintoId: null,
      competicao: 'Teste',
      descricao: 'A × B',
      detalhe: 'mudou alguma coisa'
    }

    const doPassado = repos.criarAlertas([
      { ...base, chave: 'teste:passado', dataHora: daquiA(-2) }
    ])
    verificar('não se avisa sobre um jogo que já começou', doPassado.length === 0, `→ ${doPassado.length}`)

    const doFuturo = repos.criarAlertas([{ ...base, chave: 'teste:futuro', dataHora: daquiA(48) }])
    verificar('avisa-se sobre o que ainda está para acontecer', doFuturo.length === 1)

    const repetido = repos.criarAlertas([{ ...base, chave: 'teste:futuro', dataHora: daquiA(48) }])
    verificar('o mesmo facto não gera um segundo alerta', repetido.length === 0)

    // O caso que motivou isto: apagar e ver o alerta voltar na atualização
    // seguinte fazia a lista parecer avariada.
    const paraApagar = repos.listarAlertas().find((a) => a.chave === 'teste:futuro')!
    repos.apagarAlerta(paraApagar.id)
    const depoisDeApagar = repos.criarAlertas([{ ...base, chave: 'teste:futuro', dataHora: daquiA(48) }])
    verificar(
      'um alerta apagado não volta',
      depoisDeApagar.length === 0 && !repos.listarAlertas().some((a) => a.chave === 'teste:futuro'),
      `→ ${depoisDeApagar.length} recriados`
    )

    // O recinto de um jogo é o que a FPF diz, não o habitual do clube. Um clube
    // joga em sítios diferentes consoante a equipa, e a regra antiga pôs 134
    // de 744 jogos futuros no recinto errado.
    const clubeVariosCampos = repos.encontrarOuCriarClube('Clube Com Vários Campos')
    const habitual = repos.encontrarOuCriarRecinto('Estádio Habitual do Clube')
    repos.definirRecintoDoClube(clubeVariosCampos.id, null, habitual.id)

    const noOutroCampo = repos.resolverRecinto(clubeVariosCampos.id, competicao.id, 'Pavilhão Municipal Moreira Da Maia')
    const recintoCriado = noOutroCampo != null ? repos.obterRecinto(noOutroCampo) : null
    verificar(
      'o recinto que a FPF indica manda sobre o habitual do clube',
      noOutroCampo !== habitual.id && recintoCriado?.nome === 'Pavilhão Municipal Moreira Da Maia',
      `→ ${recintoCriado?.nome ?? 'nenhum'}`
    )
    verificar(
      '"a indicar" continua a deixar o jogo sem recinto',
      repos.resolverRecinto(clubeVariosCampos.id, competicao.id, 'Recinto A Indicar') === null
    )

    // A escolha do coordenador para o clube numa competição manda sobre a FPF.
    const escolhido = repos.encontrarOuCriarRecinto('Campo Escolhido Pelo Coordenador')
    repos.definirRecintoDoClube(clubeVariosCampos.id, competicao.id, escolhido.id)
    verificar(
      'a escolha do coordenador para a competição manda sobre o texto da FPF',
      repos.resolverRecinto(clubeVariosCampos.id, competicao.id, 'Qualquer Outro Campo') === escolhido.id
    )
    repos.apagarRecintoDoClube(
      repos.listarRecintosDoClube(clubeVariosCampos.id).find((a) => a.competicaoId === competicao.id)!.id
    )

    // Os jogos gravados com a regra antiga têm de ser corrigidos: o texto da
    // FPF não muda, por isso a sincronização sozinha nunca lhes tocaria.
    const jogoNoSitioErrado = repos.guardarJogo({
      chaveNatural: 'teste:recinto-errado',
      competicaoId: competicao.id,
      fase: null,
      serie: null,
      jornada: null,
      fpfFixtureId: null,
      fpfMatchId: null,
      dataHora: horasDaqui(96),
      clubeCasaId: clubeVariosCampos.id,
      clubeForaId: clubes[1].id,
      recintoId: habitual.id,
      recintoTextoFpf: 'Pavilhão Do Centro Comunitário Das Caxinas',
      estado: 'AGENDADO'
    })
    const corrigidos = repos.reconciliarRecintos()
    const jogoReconciliado = repos.obterJogoDetalhado(jogoNoSitioErrado)!
    verificar(
      'a reconciliação põe o jogo no recinto que a FPF indica',
      corrigidos.some((c) => c.jogoId === jogoNoSitioErrado) &&
        jogoReconciliado.recintoNome === 'Pavilhão Do Centro Comunitário Das Caxinas',
      `→ ${jogoReconciliado.recintoNome}`
    )
    verificar(
      'e o cartão do jogo diz que o recinto mudou',
      (jogoReconciliado.ultimaAlteracao ?? '').includes('recinto'),
      `→ ${jogoReconciliado.ultimaAlteracao ?? 'nada'}`
    )
    verificar(
      'correr outra vez não mexe em nada',
      !repos.reconciliarRecintos().some((c) => c.jogoId === jogoNoSitioErrado)
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

    log('\n7c. Traçado das viagens')
    // Sem rede o traçado por estrada é a linha reta, mas a estrutura tem de
    // estar certa: com mar pelo meio, a viagem parte-se em estrada + voo, e o
    // aeroporto de partida é o da região de quem viaja.
    const dosAcores = { lat: 37.747, lng: -25.651 }
    const noContinente = { lat: 41.15, lng: -8.61 }
    const comAviao = await obterTrajeto(dosAcores, noContinente)
    verificar(
      'uma viagem de avião traz o aeroporto de partida',
      comAviao.aeroporto?.codigo === 'PDL',
      `→ ${comAviao.aeroporto?.nome ?? 'nenhum'} (${comAviao.aeroporto?.codigo ?? '—'})`
    )
    verificar(
      'o troço por estrada acaba no aeroporto, não no recinto',
      !!comAviao.aeroporto &&
        Math.abs(comAviao.pontos.at(-1)![0] - comAviao.aeroporto.lat) < 0.05 &&
        Math.abs(comAviao.pontos.at(-1)![1] - comAviao.aeroporto.lng) < 0.05,
      `→ acaba em ${comAviao.pontos.at(-1)?.join(', ')}`
    )
    verificar(
      'e o voo liga o aeroporto ao recinto',
      comAviao.voo?.length === 2 &&
        Math.abs(comAviao.voo[1][0] - noContinente.lat) < 0.001 &&
        Math.abs(comAviao.voo[1][1] - noContinente.lng) < 0.001,
      `→ ${comAviao.voo?.map((p) => p.join(', ')).join(' → ')}`
    )

    const porEstrada = await obterTrajeto(noContinente, { lat: 38.72, lng: -9.14 })
    verificar(
      'uma viagem por estrada não tem aeroporto nem voo',
      !porEstrada.aeroporto && !porEstrada.voo,
      `→ ${porEstrada.aeroporto ? 'com aeroporto' : 'sem aeroporto'}`
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

    // Quantos alertas existem depende do que as secções anteriores geraram; o
    // que interessa é que os por ler aparecem e que marcar como lido os limpa.
    const porLer = repos.listarAlertas(true).length
    verificar('lista os alertas por ler', porLer > 0, `→ ${porLer} por ler`)
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
    // O histórico continua a mostrar os jogos que deviam ter levado delegado —
    // é o que ficou por nomear. O que desaparece são as nomeações.
    verificar(
      'o histórico deixa de ter nomeações depois de apagar',
      repos.historicoJogos().every((j) => j.nomeacoes.length === 0),
      `→ ${repos.historicoJogos().length} jogos, ${repos
        .historicoJogos()
        .reduce((n, j) => n + j.nomeacoes.length, 0)} nomeações`
    )

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
