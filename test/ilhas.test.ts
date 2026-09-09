import { describe, expect, it } from 'vitest'
import {
  aeroportoDePartida,
  arquipelagoDe,
  CONTINENTE,
  exigeAviao,
  mudaDeArquipelago,
  regiaoDe
} from '../src/main/geo/ilhas'

const PORTO = { lat: 41.15, lng: -8.61 }
const LISBOA = { lat: 38.72, lng: -9.14 }
const FARO = { lat: 37.02, lng: -7.93 }
const PONTA_DELGADA = { lat: 37.747, lng: -25.651 }
const ANGRA = { lat: 38.655, lng: -27.216 }
const FUNCHAL = { lat: 32.65, lng: -16.91 }

describe('regiões', () => {
  it('reconhece o continente', () => {
    expect(regiaoDe(PORTO)).toBe(CONTINENTE)
    expect(regiaoDe(LISBOA)).toBe(CONTINENTE)
    expect(regiaoDe(FARO)).toBe(CONTINENTE)
  })

  it('reconhece as ilhas', () => {
    expect(regiaoDe(PONTA_DELGADA)).toBe('São Miguel')
    expect(regiaoDe(ANGRA)).toBe('Terceira')
    expect(regiaoDe(FUNCHAL)).toBe('Madeira')
  })
})

describe('arquipélagos', () => {
  const PORTO_SANTO = { lat: 33.06, lng: -16.34 }
  const HORTA = { lat: 38.53, lng: -28.63 }

  it('agrupa as ilhas no arquipélago a que pertencem', () => {
    expect(arquipelagoDe(PORTO)).toBe('Continente')
    expect(arquipelagoDe(FUNCHAL)).toBe('Madeira')
    expect(arquipelagoDe(PORTO_SANTO)).toBe('Madeira')
    expect(arquipelagoDe(PONTA_DELGADA)).toBe('Açores')
    expect(arquipelagoDe(HORTA)).toBe('Açores')
  })

  it('viajar entre ilhas do mesmo arquipélago não é sair do arquipélago', () => {
    // São voos, mas do dia a dia de quem lá vive.
    expect(exigeAviao(PONTA_DELGADA, ANGRA)).toBe(true)
    expect(mudaDeArquipelago(PONTA_DELGADA, ANGRA)).toBe(false)
    expect(mudaDeArquipelago(FUNCHAL, PORTO_SANTO)).toBe(false)
  })

  it('atravessar o Atlântico é sair do arquipélago', () => {
    expect(mudaDeArquipelago(PORTO, PONTA_DELGADA)).toBe(true)
    expect(mudaDeArquipelago(FUNCHAL, LISBOA)).toBe(true)
    // Entre arquipélagos também conta.
    expect(mudaDeArquipelago(FUNCHAL, ANGRA)).toBe(true)
  })
})

describe('quando é preciso avião', () => {
  it('dentro do continente não é', () => {
    expect(exigeAviao(PORTO, FARO)).toBe(false)
  })

  it('do continente para uma ilha é', () => {
    expect(exigeAviao(PORTO, PONTA_DELGADA)).toBe(true)
    expect(exigeAviao(LISBOA, FUNCHAL)).toBe(true)
  })

  it('de uma ilha para o continente é', () => {
    expect(exigeAviao(FUNCHAL, LISBOA)).toBe(true)
  })

  it('entre ilhas diferentes dos Açores também é', () => {
    expect(exigeAviao(PONTA_DELGADA, ANGRA)).toBe(true)
  })

  it('dentro da mesma ilha não é', () => {
    expect(exigeAviao(PONTA_DELGADA, { lat: 37.82, lng: -25.45 })).toBe(false)
  })
})

describe('aeroporto de partida', () => {
  it('quem vive no Porto parte do Porto', () => {
    expect(aeroportoDePartida(PORTO)?.codigo).toBe('OPO')
  })

  it('quem vive no Algarve parte de Faro', () => {
    expect(aeroportoDePartida(FARO)?.codigo).toBe('FAO')
  })

  it('quem vive perto de Lisboa parte de Lisboa', () => {
    expect(aeroportoDePartida({ lat: 38.9, lng: -9.0 })?.codigo).toBe('LIS')
  })

  it('nunca escolhe um aeroporto noutra região', () => {
    // Coimbra fica mais perto de Lisboa em linha reta do que do Porto,
    // mas o que importa é nunca sair do continente.
    expect(aeroportoDePartida({ lat: 40.2, lng: -8.42 })?.regiao).toBe(CONTINENTE)
  })

  it('quem vive numa ilha parte do aeroporto dessa ilha', () => {
    expect(aeroportoDePartida(PONTA_DELGADA)?.codigo).toBe('PDL')
    expect(aeroportoDePartida(ANGRA)?.codigo).toBe('TER')
    expect(aeroportoDePartida(FUNCHAL)?.codigo).toBe('FNC')
  })
})
