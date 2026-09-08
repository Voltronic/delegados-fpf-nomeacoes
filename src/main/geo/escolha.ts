import type { OrigemCoordenadas } from './consultas'

/**
 * Escolhe, entre vários resultados possíveis para o mesmo recinto, aquele em
 * que se pode confiar mais.
 *
 * Pesquisar só pelo nome produz resultados confiantes e errados: "Campo Manuel
 * Marques" existe na Madeira e o clube é de Torres Vedras; "Complexo Desportivo
 * Laranjeiras" dá uma estação de metro em Lisboa quando o clube é de Paredes.
 *
 * A defesa é o consenso: se duas pesquisas independentes (o nome do recinto e o
 * nome do clube) apontam para a mesma zona, é quase de certeza essa. Um
 * resultado isolado do outro lado do país perde para dois que concordam.
 */

export interface CandidatoCoordenada {
  lat: number
  lng: number
  origem: OrigemCoordenadas
  moradaResolvida: string
  /** "class/type" do OSM, ex.: leisure/pitch. */
  categoria: string
  /** Verdadeiro quando veio da morada ou do nome exato. */
  fiavel: boolean
}

export type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA'

export interface EscolhaCoordenada {
  candidato: CandidatoCoordenada
  /** Quantos outros resultados caem perto deste. */
  concordancia: number
  confianca: Confianca
}

/** Raio dentro do qual dois resultados se consideram a mesma localidade. */
export const RAIO_CONCORDANCIA_KM = 25

const CATEGORIAS_DESPORTIVAS = ['stadium', 'pitch', 'sports_centre', 'sports_hall', 'track', 'sport']

const RAIO_TERRA_KM = 6371

function distanciaKm(a: CandidatoCoordenada, b: CandidatoCoordenada): number {
  const rad = (g: number): number => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function eDesportivo(categoria: string): boolean {
  return CATEGORIAS_DESPORTIVAS.some((c) => categoria.includes(c))
}

/**
 * Distância acima da qual dois resultados falam claramente de regiões
 * diferentes do país — sinal de que a escolha automática pode estar errada.
 */
export const RAIO_DESACORDO_KM = 100

function ehDoClube(c: CandidatoCoordenada): boolean {
  return c.origem === 'CLUBE' || c.origem === 'CLUBE_SIMPLIFICADO'
}

export function escolherCoordenada(candidatos: CandidatoCoordenada[]): EscolhaCoordenada | null {
  if (!candidatos.length) return null

  const avaliados = candidatos.map((candidato) => {
    const concordancia = candidatos.filter(
      (outro) => outro !== candidato && distanciaKm(candidato, outro) <= RAIO_CONCORDANCIA_KM
    ).length
    // A concordância pesa mais do que tudo o resto somado: é o que distingue um
    // recinto real de um homónimo do outro lado do país, e um homónimo isolado
    // costuma ser justamente um campo de futebol com o mesmo nome.
    // Quando a pesquisa pelo clube devolve uma instalação desportiva, é quase
    // sempre o campo do próprio clube — a melhor pista que há.
    const campoDoClube = ehDoClube(candidato) && eDesportivo(candidato.categoria)
    const pontos =
      concordancia * 4 +
      (eDesportivo(candidato.categoria) ? 2 : 0) +
      (candidato.fiavel ? 1 : 0) +
      (campoDoClube ? 3 : 0)
    return { candidato, concordancia, pontos }
  })

  avaliados.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    if (b.concordancia !== a.concordancia) return b.concordancia - a.concordancia
    // Empate: prefere-se uma instalação desportiva a um lugar genérico.
    const desportivo = Number(eDesportivo(b.candidato.categoria)) - Number(eDesportivo(a.candidato.categoria))
    if (desportivo !== 0) return desportivo
    return Number(b.candidato.fiavel) - Number(a.candidato.fiavel)
  })

  const melhor = avaliados[0]
  const desportivo = eDesportivo(melhor.candidato.categoria)

  // Se alguma pesquisa apontou para outra ponta do país, há uma hipótese séria
  // de a escolha estar errada — nomes de campos repetem-se muito. Não se tenta
  // adivinhar qual está certa: assinala-se para alguém olhar.
  const desacordo = candidatos.some((c) => distanciaKm(c, melhor.candidato) > RAIO_DESACORDO_KM)

  const confianca: Confianca = desacordo
    ? 'BAIXA'
    : melhor.concordancia >= 1 && desportivo
      ? 'ALTA'
      : melhor.concordancia >= 1 || (desportivo && melhor.candidato.fiavel)
        ? 'MEDIA'
        : 'BAIXA'

  return { candidato: melhor.candidato, concordancia: melhor.concordancia, confianca }
}
