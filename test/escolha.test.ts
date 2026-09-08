import { describe, expect, it } from 'vitest'
import { escolherCoordenada, type CandidatoCoordenada } from '../src/main/geo/escolha'

const c = (
  lat: number,
  lng: number,
  extra: Partial<CandidatoCoordenada> = {}
): CandidatoCoordenada => ({
  lat,
  lng,
  origem: 'NOME',
  moradaResolvida: 'x',
  categoria: 'place/village',
  fiavel: false,
  ...extra
})

// Coordenadas aproximadas, para os casos reais que motivaram esta lógica.
const TORRES_VEDRAS = [39.09, -9.26] as const
const MADEIRA = [32.8, -16.9] as const
const PAREDES = [41.2, -8.33] as const
const LISBOA = [38.72, -9.14] as const

describe('escolha por consenso', () => {
  it('descarta o homónimo isolado quando duas pesquisas concordam', () => {
    // "Campo Manuel Marques" existe na Madeira; o clube é de Torres Vedras.
    const escolha = escolherCoordenada([
      c(MADEIRA[0], MADEIRA[1], { origem: 'NOME', categoria: 'leisure/pitch', fiavel: true }),
      c(TORRES_VEDRAS[0], TORRES_VEDRAS[1], { origem: 'CLUBE' }),
      c(TORRES_VEDRAS[0] + 0.01, TORRES_VEDRAS[1], { origem: 'CLUBE_SIMPLIFICADO' })
    ])
    expect(escolha!.candidato.lat).toBeCloseTo(TORRES_VEDRAS[0], 1)
    expect(escolha!.concordancia).toBe(1)
  })

  it('descarta a estação de metro quando o clube aponta para outro sítio', () => {
    const escolha = escolherCoordenada([
      c(LISBOA[0], LISBOA[1], { origem: 'NOME_SIMPLIFICADO', categoria: 'railway/station' }),
      c(PAREDES[0], PAREDES[1], { origem: 'CLUBE' }),
      c(PAREDES[0], PAREDES[1] + 0.01, { origem: 'CLUBE_SIMPLIFICADO' })
    ])
    expect(escolha!.candidato.lat).toBeCloseTo(PAREDES[0], 1)
  })

  it('fica com a instalação desportiva quando ela concorda com o clube', () => {
    const escolha = escolherCoordenada([
      c(PAREDES[0], PAREDES[1], { origem: 'NOME', categoria: 'leisure/stadium', fiavel: true }),
      c(PAREDES[0] + 0.02, PAREDES[1], { origem: 'CLUBE', categoria: 'place/town' })
    ])
    expect(escolha!.candidato.categoria).toBe('leisure/stadium')
    expect(escolha!.confianca).toBe('ALTA')
  })

  it('sem concordância, prefere a instalação desportiva mas baixa a confiança', () => {
    const escolha = escolherCoordenada([
      c(LISBOA[0], LISBOA[1], { origem: 'NOME', categoria: 'leisure/stadium', fiavel: true }),
      c(MADEIRA[0], MADEIRA[1], { origem: 'NOME_SIMPLIFICADO', categoria: 'place/village' })
    ])
    expect(escolha!.candidato.categoria).toBe('leisure/stadium')
    // Um resultado a 900 km do outro é motivo para alguém conferir.
    expect(escolha!.confianca).toBe('BAIXA')
  })

  it('um clube distante não derruba o estádio, mas baixa a confiança', () => {
    const escolha = escolherCoordenada([
      c(LISBOA[0], LISBOA[1], { origem: 'NOME', categoria: 'leisure/stadium', fiavel: true }),
      c(MADEIRA[0], MADEIRA[1], { origem: 'CLUBE', categoria: 'place/village' })
    ])
    expect(escolha!.candidato.lat).toBeCloseTo(LISBOA[0], 1)
    expect(escolha!.confianca).toBe('BAIXA')
  })

  it('marca como pouco fiável um resultado isolado e não desportivo', () => {
    const escolha = escolherCoordenada([
      c(LISBOA[0], LISBOA[1], { origem: 'CLUBE_SIMPLIFICADO', categoria: 'leisure/garden' })
    ])
    expect(escolha!.confianca).toBe('BAIXA')
    expect(escolha!.concordancia).toBe(0)
  })

  it('conta a concordância de todos os que caem perto', () => {
    const escolha = escolherCoordenada([
      c(PAREDES[0], PAREDES[1]),
      c(PAREDES[0] + 0.01, PAREDES[1]),
      c(PAREDES[0], PAREDES[1] + 0.01),
      c(MADEIRA[0], MADEIRA[1], { categoria: 'leisure/pitch', fiavel: true })
    ])
    expect(escolha!.concordancia).toBe(2)
    expect(escolha!.candidato.lat).toBeCloseTo(PAREDES[0], 1)
  })

  it('devolve null sem candidatos', () => {
    expect(escolherCoordenada([])).toBeNull()
  })

  it('um único candidato desportivo e fiável é razoável', () => {
    const escolha = escolherCoordenada([
      c(PAREDES[0], PAREDES[1], { origem: 'NOME', categoria: 'leisure/stadium', fiavel: true })
    ])
    expect(escolha!.confianca).toBe('MEDIA')
  })
})

describe('o campo do próprio clube e o desacordo regional', () => {
  it('prefere o campo devolvido pela pesquisa do clube ao homónimo distante', () => {
    // Caso real: "Campo Manuel Marques" existe na Madeira, mas "Torreense"
    // devolve o campo do Sport Clube União Torreense, em Torres Vedras.
    const escolha = escolherCoordenada([
      c(MADEIRA[0], MADEIRA[1], { origem: 'NOME', categoria: 'leisure/pitch', fiavel: true }),
      c(40.66, -8.6, { origem: 'NOME_SIMPLIFICADO', categoria: 'place/farm' }),
      c(TORRES_VEDRAS[0], TORRES_VEDRAS[1], { origem: 'CLUBE_SIMPLIFICADO', categoria: 'leisure/pitch' })
    ])
    expect(escolha!.candidato.lat).toBeCloseTo(TORRES_VEDRAS[0], 1)
  })

  it('não deixa o clube derrubar um recinto que concorda com ele', () => {
    const escolha = escolherCoordenada([
      c(PAREDES[0], PAREDES[1], { origem: 'NOME', categoria: 'leisure/stadium', fiavel: true }),
      c(PAREDES[0] + 0.05, PAREDES[1], { origem: 'CLUBE', categoria: 'place/town' })
    ])
    expect(escolha!.candidato.categoria).toBe('leisure/stadium')
    expect(escolha!.confianca).toBe('ALTA')
  })

  it('marca como pouco fiável quando as pesquisas apontam para regiões diferentes', () => {
    // Não se tenta adivinhar qual está certa — assinala-se para alguém ver.
    const escolha = escolherCoordenada([
      c(MADEIRA[0], MADEIRA[1], { origem: 'NOME', categoria: 'leisure/pitch', fiavel: true }),
      c(PAREDES[0], PAREDES[1], { origem: 'CLUBE', categoria: 'place/town' })
    ])
    expect(escolha!.confianca).toBe('BAIXA')
  })

  it('não assinala desacordo quando está tudo na mesma zona', () => {
    const escolha = escolherCoordenada([
      c(PAREDES[0], PAREDES[1], { origem: 'NOME', categoria: 'leisure/stadium', fiavel: true }),
      c(PAREDES[0] + 0.1, PAREDES[1], { origem: 'CLUBE', categoria: 'place/town' })
    ])
    expect(escolha!.confianca).toBe('ALTA')
  })
})
