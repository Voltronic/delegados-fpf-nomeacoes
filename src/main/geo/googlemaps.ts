/**
 * Extrai coordenadas de um link do Google Maps.
 *
 * É a forma mais rápida de corrigir um recinto que a pesquisa automática não
 * acerta: quem conhece o sítio abre o Google Maps, copia o link e cola-o.
 */

export interface CoordenadasColadas {
  lat: number
  lng: number
  /** De que parte do link vieram, para se perceber o que foi lido. */
  fonte: 'local' | 'centro' | 'consulta' | 'texto'
}

function valido(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  )
}

export function extrairCoordenadas(texto: string): CoordenadasColadas | null {
  const limpo = texto.trim()
  if (!limpo) return null

  // `!3d<lat>!4d<lng>` é o ponto do local em si — o mais fiável. Quando aparece
  // repetido, a última ocorrência é a do local escolhido.
  const locais = [...limpo.matchAll(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/g)]
  if (locais.length) {
    const m = locais[locais.length - 1]
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (valido(lat, lng)) return { lat, lng, fonte: 'local' }
  }

  // `?q=` ou `query=` com coordenadas.
  const consulta = limpo.match(/[?&](?:q|query|ll)=(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/)
  if (consulta) {
    const lat = Number(consulta[1])
    const lng = Number(consulta[2])
    if (valido(lat, lng)) return { lat, lng, fonte: 'consulta' }
  }

  // `@<lat>,<lng>,<zoom>` é o centro do mapa: serve, mas é menos exato.
  const centro = limpo.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (centro) {
    const lat = Number(centro[1])
    const lng = Number(centro[2])
    if (valido(lat, lng)) return { lat, lng, fonte: 'centro' }
  }

  // Coordenadas escritas à mão, "39.4034, -9.1264".
  const texto2 = limpo.match(/^(-?\d+\.\d+)\s*[,;]\s*(-?\d+\.\d+)$/)
  if (texto2) {
    const lat = Number(texto2[1])
    const lng = Number(texto2[2])
    if (valido(lat, lng)) return { lat, lng, fonte: 'texto' }
  }

  return null
}
