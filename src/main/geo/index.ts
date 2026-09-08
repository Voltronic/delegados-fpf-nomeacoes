import { net } from 'electron'
import { lerConfig, obterBaseDados } from '../db'
import type { FonteDistancia } from '@shared/tipos'

export interface Coordenadas {
  lat: number
  lng: number
}

export interface ResultadoGeocodificacao extends Coordenadas {
  moradaResolvida: string
  /** Classificação do OSM, ex.: leisure/pitch, place/village. */
  categoria: string
}

export interface ResultadoDistancia {
  km: number
  minutos: number | null
  fonte: FonteDistancia
}

const RAIO_TERRA_KM = 6371

/** Distância em linha reta, usada como recurso quando não há serviço de rotas. */
export function haversineKm(a: Coordenadas, b: Coordenadas): number {
  const rad = (g: number): number => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

let ultimoNominatim = 0

async function pedirJson<T>(url: string, cabecalhos: Record<string, string> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const pedido = net.request({ method: 'GET', url, redirect: 'follow' })
    pedido.setHeader('Accept', 'application/json')
    for (const [k, v] of Object.entries(cabecalhos)) pedido.setHeader(k, v)
    pedido.on('response', (resposta) => {
      const pedacos: Buffer[] = []
      resposta.on('data', (p) => pedacos.push(Buffer.from(p)))
      resposta.on('end', () => {
        const corpo = Buffer.concat(pedacos).toString('utf-8')
        if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
          reject(new Error(`HTTP ${resposta.statusCode} em ${url}`))
          return
        }
        try {
          resolve(JSON.parse(corpo) as T)
        } catch {
          reject(new Error(`Resposta não é JSON válido: ${url}`))
        }
      })
      resposta.on('error', reject)
    })
    pedido.on('error', reject)
    pedido.end()
  })
}

/**
 * Geocodifica uma morada com o Nominatim, respeitando o limite público de um
 * pedido por segundo e identificando a aplicação, como a política do serviço exige.
 */
export async function geocodificar(morada: string): Promise<ResultadoGeocodificacao | null> {
  const texto = morada.trim()
  if (!texto) return null

  const espera = 1100 - (Date.now() - ultimoNominatim)
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
  ultimoNominatim = Date.now()

  const base = lerConfig('geo.nominatimUrl') ?? 'https://nominatim.openstreetmap.org'
  const contacto = lerConfig('geo.contacto') ?? 'nomeacoes-delegados-fpf'
  const url = `${base}/search?format=jsonv2&limit=5&countrycodes=pt&q=${encodeURIComponent(texto)}`

  const resposta = await pedirJson<
    { lat: string; lon: string; display_name: string; class?: string; type?: string }[]
  >(url, {
    'User-Agent': `NomeacoesDelegadosFPF/0.1 (${contacto})`,
    'Accept-Language': 'pt-PT'
  })
  if (!resposta.length) return null

  // Havendo várias respostas, prefere-se uma instalação desportiva: procura-se
  // um recinto, não a rua com o mesmo nome.
  const desportivo = resposta.find((r) =>
    ['leisure', 'sport'].includes(r.class ?? '') ||
    ['stadium', 'pitch', 'sports_centre', 'sports_hall'].includes(r.type ?? '')
  )
  const escolhido = desportivo ?? resposta[0]
  return {
    lat: Number(escolhido.lat),
    lng: Number(escolhido.lon),
    moradaResolvida: escolhido.display_name,
    categoria: `${escolhido.class ?? '?'}/${escolhido.type ?? '?'}`
  }
}

/** Distância e duração por estrada (só ida). Devolve null se o serviço falhar. */
export async function distanciaRodoviaria(
  origem: Coordenadas,
  destino: Coordenadas
): Promise<{ km: number; minutos: number } | null> {
  const base = lerConfig('geo.osrmUrl') ?? 'https://router.project-osrm.org'
  const coords = `${origem.lng},${origem.lat};${destino.lng},${destino.lat}`
  const url = `${base}/route/v1/driving/${coords}?overview=false&alternatives=false`
  try {
    const resposta = await pedirJson<{ code: string; routes?: { distance: number; duration: number }[] }>(url)
    const rota = resposta.routes?.[0]
    if (resposta.code !== 'Ok' || !rota) return null
    return { km: rota.distance / 1000, minutos: rota.duration / 60 }
  } catch {
    return null
  }
}

interface LinhaCache {
  km: number
  minutos: number | null
  fonte: string
}

/**
 * Distância de ida entre a casa de um delegado e um recinto, com cache
 * persistente. A cache é a defesa contra os limites dos serviços públicos: uma
 * jornada inteira consulta dezenas de pares, quase todos já conhecidos.
 */
export async function obterDistancia(
  delegadoId: number,
  recintoId: number,
  origem: Coordenadas | null,
  destino: Coordenadas | null
): Promise<ResultadoDistancia | null> {
  const db = obterBaseDados()
  const cache = db
    .prepare('SELECT km, minutos, fonte FROM distancia_cache WHERE delegado_id = ? AND recinto_id = ?')
    .get(delegadoId, recintoId) as LinhaCache | undefined
  if (cache) return { km: cache.km, minutos: cache.minutos, fonte: cache.fonte as FonteDistancia }

  if (!origem || !destino) return null

  const rota = await distanciaRodoviaria(origem, destino)
  const fator = Number(lerConfig('geo.fatorHaversine') ?? '1.25')
  const resultado: ResultadoDistancia = rota
    ? { km: rota.km, minutos: rota.minutos, fonte: 'OSRM' }
    : { km: haversineKm(origem, destino) * fator, minutos: null, fonte: 'HAVERSINE' }

  db.prepare(
    `INSERT INTO distancia_cache (delegado_id, recinto_id, km, minutos, fonte, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(delegado_id, recinto_id) DO UPDATE SET
       km = excluded.km, minutos = excluded.minutos, fonte = excluded.fonte,
       atualizado_em = excluded.atualizado_em`
  ).run(delegadoId, recintoId, resultado.km, resultado.minutos, resultado.fonte, new Date().toISOString())

  return resultado
}

/** Apaga a cache de distâncias de um delegado ou recinto (após mudar coordenadas). */
export function invalidarCache(alvo: { delegadoId?: number; recintoId?: number }): void {
  const db = obterBaseDados()
  if (alvo.delegadoId != null) {
    db.prepare('DELETE FROM distancia_cache WHERE delegado_id = ?').run(alvo.delegadoId)
  }
  if (alvo.recintoId != null) {
    db.prepare('DELETE FROM distancia_cache WHERE recinto_id = ?').run(alvo.recintoId)
  }
}
