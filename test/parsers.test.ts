import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  anosDaEpoca,
  chaveNatural,
  parseDetalhesCompeticao,
  parseEpocas,
  parseInfoJogo,
  parseJogosJornada,
  parseAssociacoes,
  parseOrganizacoes,
  resolverData
} from '../src/main/fpf/parsers'
import { normalizarNome, texto } from '../src/main/fpf/html'

const fixture = (nome: string): string => readFileSync(join(__dirname, 'fixtures', nome), 'utf-8')

describe('utilitários de HTML', () => {
  it('decodifica entidades numéricas e nomeadas', () => {
    expect(texto('<span>S&#201;RIE  1</span>')).toBe('SÉRIE 1')
    expect(texto('Campo Quinta Nova, N&#186; 1')).toBe('Campo Quinta Nova, Nº 1')
    expect(texto('Atl. C. Vila Me&#227;')).toBe('Atl. C. Vila Meã')
  })

  it('normaliza nomes para comparação', () => {
    expect(normalizarNome('Atl. C. Vila Meã')).toBe('atl c vila mea')
    expect(normalizarNome('Estádio Doutor Diogo Alves Vaz Pereira')).toBe(
      'estadio doutor diogo alves vaz pereira'
    )
  })
})

describe('datas da época', () => {
  it('extrai os anos da descrição', () => {
    expect(anosDaEpoca('2026-2027')).toEqual([2026, 2027])
  })

  it('atribui o primeiro ano da época aos meses de julho a dezembro', () => {
    expect(resolverData('13 set', '15:00', [2026, 2027])).toBe('2026-09-13T15:00')
    expect(resolverData('26 ago', null, [2026, 2027])).toBe('2026-08-26T00:00')
  })

  it('atribui o segundo ano da época aos meses de janeiro a junho', () => {
    expect(resolverData('4 fev', '11:00', [2026, 2027])).toBe('2027-02-04T11:00')
  })

  it('devolve null quando não há data', () => {
    expect(resolverData(null, '15:00', [2026, 2027])).toBeNull()
    expect(resolverData('adiado', null, [2026, 2027])).toBeNull()
  })
})

describe('parseEpocas', () => {
  it('lê as épocas disponíveis e a selecionada', () => {
    const epocas = parseEpocas(fixture('competition-index.html'))
    expect(epocas.length).toBeGreaterThan(5)
    expect(epocas[0]).toMatchObject({ seasonId: 106, descricao: '2026-2027' })
    expect(epocas.filter((e) => e.selecionada)).toHaveLength(1)
  })
})

describe('parseOrganizacoes', () => {
  const organizacoes = parseOrganizacoes(fixture('competition-index.html'))

  it('encontra a organização das competições nacionais', () => {
    const fpf = organizacoes.find((o) => o.nome === 'Competições FPF')
    expect(fpf).toBeDefined()
    expect(fpf!.competicoes.length).toBeGreaterThan(20)
  })

  it('lê o Campeonato de Portugal com o id correto', () => {
    const fpf = organizacoes.find((o) => o.nome === 'Competições FPF')!
    const cp = fpf.competicoes.find((c) => c.competitionId === 29529)
    expect(cp?.nome).toBe('CAMPEONATO DE PORTUGAL')
    expect(cp?.modalidade).toBeTruthy()
  })

  it('só traz as organizações com competições listadas no índice', () => {
    // As distritais aparecem no índice apenas como links; ver parseAssociacoes.
    expect(organizacoes.map((o) => o.nome)).toEqual(['Competições Liga', 'Competições FPF'])
  })
})

describe('parseAssociacoes', () => {
  it('lê as associações distritais do índice', () => {
    const associacoes = parseAssociacoes(fixture('competition-index.html'))
    expect(associacoes.length).toBeGreaterThan(15)
    expect(associacoes.every((a) => Number.isInteger(a.associationId) && a.nome.length > 0)).toBe(true)
    expect(associacoes.some((a) => a.associationId === 229)).toBe(true)
  })
})

describe('parseDetalhesCompeticao', () => {
  const detalhes = parseDetalhesCompeticao(fixture('competition-details.html'))

  it('lê o nome da competição', () => {
    expect(detalhes.nome).toBe('CAMPEONATO DE PORTUGAL')
  })

  it('lê a fase e as quatro séries', () => {
    expect(detalhes.fases).toHaveLength(1)
    expect(detalhes.fases[0].nome).toBe('1ª FASE')
    expect(detalhes.fases[0].series.map((s) => s.nome)).toEqual([
      'SÉRIE 1',
      'SÉRIE 2',
      'SÉRIE 3',
      'SÉRIE 4'
    ])
  })

  it('lê as jornadas de cada série e marca a atual', () => {
    const serie1 = detalhes.fases[0].series[0]
    expect(serie1.serieId).toBe(97349)
    expect(serie1.jornadas.length).toBeGreaterThan(20)
    expect(serie1.jornadas[0]).toMatchObject({ numero: '1' })
    expect(serie1.jornadas.every((j) => Number.isInteger(j.fixtureId))).toBe(true)
    expect(serie1.jornadas.filter((j) => j.atual).length).toBeLessThanOrEqual(1)
  })

  it('não repete fixtureIds entre séries', () => {
    const todos = detalhes.fases.flatMap((f) => f.series.flatMap((s) => s.jornadas.map((j) => j.fixtureId)))
    expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('parseJogosJornada — jogos futuros', () => {
  const jogos = parseJogosJornada(fixture('fixture-futuro.html'))

  it('lê todos os jogos da jornada', () => {
    expect(jogos.length).toBeGreaterThan(3)
  })

  it('lê equipas, data, hora e recinto', () => {
    const jogo = jogos[0]
    expect(jogo.clubeCasa).toBe('Atl. C. Vila Meã')
    expect(jogo.clubeFora).toBe('Fc Vinhais')
    expect(jogo.dataTexto).toBe('13 set')
    expect(jogo.horaTexto).toBe('15:00')
    expect(jogo.recinto).toBe('Estadio Municipal Vila Meã')
  })

  it('não inventa matchId nem resultado para jogos por realizar', () => {
    expect(jogos[0].matchId).toBeNull()
    expect(jogos[0].resultado).toBeNull()
  })

  it('associa o recinto certo a cada jogo', () => {
    const montalegre = jogos.find((j) => j.clubeCasa === 'Cdc Montalegre')
    expect(montalegre?.recinto).toBe('Estádio Doutor Diogo Alves Vaz Pereira')
  })
})

describe('parseJogosJornada — jogos realizados', () => {
  const jogos = parseJogosJornada(fixture('fixture-jogado.html'))

  it('lê o matchId, o resultado e o recinto', () => {
    expect(jogos).toHaveLength(1)
    expect(jogos[0]).toMatchObject({
      matchId: 2580597,
      clubeCasa: 'Carcavelos',
      clubeFora: 'Cascais, Sad',
      resultado: '2 - 2',
      dataTexto: '26 ago',
      recinto: 'Campo Quinta Nova, Nº 1'
    })
  })
})

describe('parseInfoJogo', () => {
  it('lê data, hora e estádio do detalhe do jogo', () => {
    const info = parseInfoJogo(fixture('match-info.html'))
    expect(info.data).toBe('26-08-2026')
    expect(info.hora).toBe('20:30')
    expect(info.estadio).toBe('Campo Quinta Nova, Nº 1')
    expect(info.dataHora).toBe('2026-08-26T20:30')
  })
})

describe('chaveNatural', () => {
  it('é estável face a acentos e maiúsculas', () => {
    expect(chaveNatural(1, 652366, 'Atl. C. Vila Meã', 'Fc Vinhais')).toBe(
      chaveNatural(1, 652366, 'ATL C VILA MEA', 'fc  vinhais')
    )
  })

  it('distingue jogos diferentes', () => {
    expect(chaveNatural(1, 652366, 'A', 'B')).not.toBe(chaveNatural(1, 652366, 'B', 'A'))
  })
})

// O cliente tem um plano B: quando o Cloudflare recusa o pedido direto, o HTML
// vem de uma navegação real numa janela oculta e chega já serializado pelo DOM
// (entidades resolvidas, atributos normalizados). Os parsers têm de aguentar
// as duas formas, por isso são exercitados também sobre essas fixtures.
describe('HTML vindo da janela oculta', () => {
  it('lê fases, séries e jornadas na mesma', () => {
    const detalhes = parseDetalhesCompeticao(fixture('competition-details-janela.html'))
    expect(detalhes.nome).toBe('CAMPEONATO DE PORTUGAL')
    expect(detalhes.fases[0].series.map((s) => s.nome)).toEqual([
      'SÉRIE 1',
      'SÉRIE 2',
      'SÉRIE 3',
      'SÉRIE 4'
    ])
    const jornadas = detalhes.fases.flatMap((f) => f.series).flatMap((s) => s.jornadas)
    expect(jornadas.length).toBeGreaterThan(80)
    expect(jornadas.every((j) => Number.isInteger(j.fixtureId))).toBe(true)
  })

  it('lê os jogos da jornada na mesma', () => {
    const jogos = parseJogosJornada(fixture('fixture-futuro-janela.html'))
    expect(jogos.length).toBeGreaterThan(3)
    expect(jogos[0]).toMatchObject({
      clubeCasa: 'Atl. C. Vila Meã',
      clubeFora: 'Fc Vinhais',
      dataTexto: '13 set',
      horaTexto: '15:00',
      recinto: 'Estadio Municipal Vila Meã'
    })
  })
})
