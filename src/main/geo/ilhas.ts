/**
 * Deslocações que obrigam a avião.
 *
 * Regra do coordenador: quando um delegado vai a uma ilha, ou vem de uma ilha
 * para o continente, os quilómetros que contam são só os de casa até ao
 * aeroporto mais próximo, ida e volta. As horas de voo não são quilómetros
 * percorridos por ele e não entram no equilíbrio da época.
 *
 * Sem isto, uma ida a Ponta Delgada aparecia como 1.500 km por estrada — um
 * disparate que arruinava o equilíbrio de quem calhasse ir.
 */

export interface Ponto {
  lat: number
  lng: number
}

export interface Aeroporto extends Ponto {
  codigo: string
  nome: string
  regiao: string
}

/**
 * Cada massa de terra é uma região: entre regiões diferentes só se vai de
 * avião. As caixas são generosas mas não se sobrepõem — as ilhas dos Açores
 * estão bem separadas umas das outras.
 */
interface Regiao {
  nome: string
  latMin: number
  latMax: number
  lngMin: number
  lngMax: number
}

const REGIOES: Regiao[] = [
  { nome: 'Madeira', latMin: 32.6, latMax: 32.92, lngMin: -17.32, lngMax: -16.62 },
  { nome: 'Porto Santo', latMin: 32.95, latMax: 33.15, lngMin: -16.45, lngMax: -16.24 },
  { nome: 'Santa Maria', latMin: 36.9, latMax: 37.05, lngMin: -25.25, lngMax: -24.95 },
  { nome: 'São Miguel', latMin: 37.65, latMax: 37.95, lngMin: -25.95, lngMax: -25.08 },
  { nome: 'Terceira', latMin: 38.6, latMax: 38.85, lngMin: -27.45, lngMax: -26.98 },
  { nome: 'Graciosa', latMin: 38.98, latMax: 39.15, lngMin: -28.1, lngMax: -27.9 },
  { nome: 'São Jorge', latMin: 38.5, latMax: 38.78, lngMin: -28.4, lngMax: -27.72 },
  { nome: 'Pico', latMin: 38.36, latMax: 38.58, lngMin: -28.6, lngMax: -28.0 },
  { nome: 'Faial', latMin: 38.48, latMax: 38.68, lngMin: -28.88, lngMax: -28.58 },
  { nome: 'Flores', latMin: 39.33, latMax: 39.56, lngMin: -31.34, lngMax: -31.08 },
  { nome: 'Corvo', latMin: 39.63, latMax: 39.75, lngMin: -31.18, lngMax: -31.02 }
]

export const CONTINENTE = 'Continente'

export const AEROPORTOS: Aeroporto[] = [
  { codigo: 'LIS', nome: 'Lisboa', lat: 38.7756, lng: -9.1354, regiao: CONTINENTE },
  { codigo: 'OPO', nome: 'Porto', lat: 41.2481, lng: -8.6814, regiao: CONTINENTE },
  { codigo: 'FAO', nome: 'Faro', lat: 37.0144, lng: -7.9659, regiao: CONTINENTE },
  { codigo: 'FNC', nome: 'Madeira', lat: 32.6979, lng: -16.7745, regiao: 'Madeira' },
  { codigo: 'PXO', nome: 'Porto Santo', lat: 33.0734, lng: -16.35, regiao: 'Porto Santo' },
  { codigo: 'PDL', nome: 'Ponta Delgada', lat: 37.7412, lng: -25.6979, regiao: 'São Miguel' },
  { codigo: 'SMA', nome: 'Santa Maria', lat: 36.9714, lng: -25.1706, regiao: 'Santa Maria' },
  { codigo: 'TER', nome: 'Lajes, Terceira', lat: 38.7618, lng: -27.0908, regiao: 'Terceira' },
  { codigo: 'GRW', nome: 'Graciosa', lat: 39.0922, lng: -28.0298, regiao: 'Graciosa' },
  { codigo: 'SJZ', nome: 'São Jorge', lat: 38.6655, lng: -28.1758, regiao: 'São Jorge' },
  { codigo: 'PIX', nome: 'Pico', lat: 38.5543, lng: -28.4413, regiao: 'Pico' },
  { codigo: 'HOR', nome: 'Horta, Faial', lat: 38.5199, lng: -28.7159, regiao: 'Faial' },
  { codigo: 'FLW', nome: 'Flores', lat: 39.4553, lng: -31.1314, regiao: 'Flores' },
  { codigo: 'CVU', nome: 'Corvo', lat: 39.6715, lng: -31.1136, regiao: 'Corvo' }
]

export function regiaoDe(ponto: Ponto): string {
  const r = REGIOES.find(
    (x) =>
      ponto.lat >= x.latMin && ponto.lat <= x.latMax && ponto.lng >= x.lngMin && ponto.lng <= x.lngMax
  )
  return r?.nome ?? CONTINENTE
}

/** Verdadeiro quando os dois pontos estão em massas de terra diferentes. */
export function exigeAviao(origem: Ponto, destino: Ponto): boolean {
  return regiaoDe(origem) !== regiaoDe(destino)
}

const RAIO_TERRA_KM = 6371

function emLinhaReta(a: Ponto, b: Ponto): number {
  const rad = (g: number): number => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Aeroporto de onde o delegado parte: o mais próximo de casa, dentro da sua
 * própria região. Quem vive no Porto não vai apanhar o avião a Ponta Delgada.
 */
export function aeroportoDePartida(origem: Ponto): Aeroporto | null {
  const regiao = regiaoDe(origem)
  const candidatos = AEROPORTOS.filter((a) => a.regiao === regiao)
  if (!candidatos.length) return null
  return candidatos.reduce((melhor, a) =>
    emLinhaReta(origem, a) < emLinhaReta(origem, melhor) ? a : melhor
  )
}
