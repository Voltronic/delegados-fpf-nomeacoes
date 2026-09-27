/**
 * O retângulo que cobre Portugal: continente, Madeira e Açores.
 *
 * Serve para apanhar o engano mais fácil de cometer e mais difícil de ver: o
 * Google Maps tem homónimos noutros países, e um link copiado depressa põe o
 * "Estádio Municipal de Castelo Branco" no Paraná e o "Campo de Futebol Bom
 * Jesus" no Rio Grande do Sul. As coordenadas ficam gravadas como confirmadas,
 * e a partir daí todas as distâncias desse recinto são inventadas — incluindo
 * a penalização de avião, que existe para casos a sério.
 */
export const LIMITES_PORTUGAL = {
  /** Sul: abaixo de Santa Maria, nos Açores. */
  latMin: 32,
  /** Norte: acima de Melgaço. */
  latMax: 42.2,
  /** Oeste: para lá das Flores, nos Açores. */
  lngMin: -31.5,
  /** Este: a fronteira com Espanha. */
  lngMax: -6
} as const

export function foraDePortugal(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false
  return (
    lat < LIMITES_PORTUGAL.latMin ||
    lat > LIMITES_PORTUGAL.latMax ||
    lng < LIMITES_PORTUGAL.lngMin ||
    lng > LIMITES_PORTUGAL.lngMax
  )
}

/** A frase a mostrar a quem colou um ponto fora do país. */
export function avisoForaDePortugal(lat: number, lng: number): string {
  return (
    `As coordenadas (${lat.toFixed(5)}, ${lng.toFixed(5)}) não são em Portugal. ` +
    'O Google Maps tem locais com o mesmo nome noutros países — confirme que escolheu o certo ' +
    'antes de gravar, senão os quilómetros deste recinto ficam todos errados.'
  )
}
