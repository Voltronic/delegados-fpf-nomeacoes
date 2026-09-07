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
import { join } from 'node:path'
import { abrirBaseDados, escreverConfig } from './db'
import * as repos from './db/repos'
import { candidatosParaJogo, nomear, propostaAutomatica } from './engine/servico'
import { ClienteFpf } from './fpf/cliente'
import { parseDetalhesCompeticao, parseEpocas, parseJogosJornada, parseOrganizacoes } from './fpf/parsers'

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
    abrirBaseDados(caminho)
    // Distâncias em linha reta, para a verificação não depender de serviços externos.
    escreverConfig('geo.osrmUrl', 'http://127.0.0.1:1')
    verificar('base de dados criada e migrada', repos.listarDelegados().length === 0)

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

    const competicao = repos.guardarCompeticao({
      fpfCompetitionId: 99999,
      seasonId: 106,
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

    log('\n7. Proposta automática')
    const proposta = await propostaAutomatica(jogoIds)
    const usados = new Set(proposta.flatMap((p) => [p.principal?.delegadoId, p.campo?.delegadoId]).filter(Boolean))
    verificar('propõe para os jogos ainda por nomear', proposta.length === 7, `→ ${proposta.length} jogos`)
    verificar('distribui por mais do que um delegado', usados.size >= 2, `→ ${usados.size} delegados usados`)
    verificar(
      'nunca repete delegado no mesmo jogo',
      proposta.every((p) => !p.principal || !p.campo || p.principal.delegadoId !== p.campo.delegadoId)
    )
    verificar('explica cada sugestão', proposta.every((p) => p.motivo.length > 0))

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
    } catch (erro) {
      log(`  ${vermelho('!')} sem acesso ao site da FPF: ${(erro as Error).message}`)
      log('    (a aplicação continua a funcionar com importação manual)')
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }

  log(falhas === 0 ? `\n${verde('Verificação concluída sem falhas.')}\n` : `\n${vermelho(`${falhas} verificações falharam.`)}\n`)
  app.exit(falhas === 0 ? 0 : 1)
}

app.whenReady().then(principal)
