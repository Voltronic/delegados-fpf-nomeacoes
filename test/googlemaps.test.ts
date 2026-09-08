import { describe, expect, it } from 'vitest'
import { extrairCoordenadas } from '../src/main/geo/googlemaps'

describe('coordenadas coladas do Google Maps', () => {
  it('prefere o ponto do local ao centro do mapa', () => {
    // Link real: o centro (@39.1786915,-8.5807025) e o local (!3d/!4d) diferem.
    const url =
      'https://www.google.com/maps/place/Complexo+Desportivo+Prof.+Jos%C3%A9+Sousa+Gomes/@39.1786915,-8.5807025,842m/data=!3m1!1e3!4m14!1m7!3m6!1s0xd18f124312ef14d:0x39e8dc667a82b655!8m2!3d39.1786874!4d-8.5781276!16s%2Fg%2F11gxtm91nl'
    expect(extrairCoordenadas(url)).toEqual({ lat: 39.1786874, lng: -8.5781276, fonte: 'local' })
  })

  it('lê um link sem o bloco do local, pelo centro', () => {
    const r = extrairCoordenadas('https://www.google.com/maps/@38.7229,-9.3040,848m/data=!3m2!1e3!4b1')
    expect(r).toEqual({ lat: 38.7229, lng: -9.304, fonte: 'centro' })
  })

  it('lê coordenadas nos Açores, com longitude muito negativa', () => {
    const url = 'https://www.google.com/maps/place/X/@37.747,-25.65,859m/data=!8m2!3d37.7470132!4d-25.6510481'
    expect(extrairCoordenadas(url)).toMatchObject({ lat: 37.7470132, lng: -25.6510481 })
  })

  it('aceita o formato ?q=lat,lng', () => {
    expect(extrairCoordenadas('https://maps.google.com/?q=41.4537919,-8.1655133')).toEqual({
      lat: 41.4537919,
      lng: -8.1655133,
      fonte: 'consulta'
    })
  })

  it('aceita coordenadas escritas à mão', () => {
    expect(extrairCoordenadas('39.4034078, -9.126419')).toEqual({
      lat: 39.4034078,
      lng: -9.126419,
      fonte: 'texto'
    })
  })

  it('devolve null para texto que não são coordenadas', () => {
    expect(extrairCoordenadas('Campo da Mata, Caldas da Rainha')).toBeNull()
    expect(extrairCoordenadas('')).toBeNull()
    expect(extrairCoordenadas('https://www.google.com/maps/search/estadio')).toBeNull()
  })

  it('recusa valores fora do intervalo possível', () => {
    expect(extrairCoordenadas('!3d999.0!4d-8.5')).toBeNull()
    expect(extrairCoordenadas('12.0, 500.0')).toBeNull()
  })
})
