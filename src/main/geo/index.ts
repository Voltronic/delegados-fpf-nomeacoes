import { net } from 'electron'
import { lerConfig, obterBaseDados } from '../db'
import type { FonteDistancia } from '@shared/tipos'
import { aeroportoDePartida, exigeAviao } from './ilhas'

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

/**
 * O Nominatim aceita um pedido por segundo, e a geocodificação em lote dos
 * recintos ocupa esse ritmo durante minutos. Sem prioridades, uma pesquisa
 * feita pelo coordenador ficava atrás de centenas de pedidos automáticos e a
 * interface parecia pendurada. Os pedidos do utilizador passam à frente.
 */
interface PedidoFila {
  executar: () => void
  prioritario: boolean
}

const fila: PedidoFila[] = []
let aProcessar = false
let ultimoNominatim = 0

function aguardarVez(prioritario: boolean): Promise<void> {
  return new Promise((resolve) => {
    const pedido: PedidoFila = { executar: resolve, prioritario }
    if (prioritario) {
      // Entra antes dos automáticos, mas depois de outros pedidos do utilizador.
      const posicao = fila.findIndex((p) => !p.prioritario)
      if (posicao === -1) fila.push(pedido)
      else fila.splice(posicao, 0, pedido)
    } else {
      fila.push(pedido)
    }
    void processarFila()
  })
}

async function processarFila(): Promise<void> {
  if (aProcessar) return
  aProcessar = true
  try {
    while (fila.length) {
      const espera = 1100 - (Date.now() - ultimoNominatim)
      if (espera > 0) await new Promise((r) => setTimeout(r, espera))
      ultimoNominatim = Date.now()
      fila.shift()!.executar()
      // Deixa o pedido arrancar antes de contar o intervalo seguinte.
      await new Promise((r) => setTimeout(r, 0))
    }
  } finally {
    aProcessar = false
  }
}

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
export async function geocodificar(
  morada: string,
  prioritario = false
): Promise<ResultadoGeocodificacao | null> {
  const texto = morada.trim()
  if (!texto) return null

  await aguardarVez(prioritario)

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

/**
 * Traçado da viagem, para desenhar no mapa.
 *
 * `estimado` diz que não se conseguiu a estrada real e o que vai é a linha
 * reta entre os dois pontos — acontece sem rede, e sempre que há mar pelo meio.
 * Mostrar uma linha reta como se fosse o caminho seria mentir sobre a viagem.
 */
export interface Trajeto {
  /** Troço por estrada: de casa até ao aeroporto, ou até ao próprio recinto. */
  pontos: [number, number][]
  estimado: boolean
  /** Aeroporto de partida, quando a viagem exige avião. */
  aeroporto?: { nome: string; codigo: string; lat: number; lng: number }
  /** Troço aéreo, do aeroporto até ao recinto. */
  voo?: [number, number][]
}

/** Só se pede o traçado quando é para o mostrar, e guarda-se para não repetir. */
const trajetos = new Map<string, Trajeto>()

export async function obterTrajeto(origem: Coordenadas, destino: Coordenadas): Promise<Trajeto> {
  const chave = `${origem.lat},${origem.lng}:${destino.lat},${destino.lng}`
  const guardado = trajetos.get(chave)
  if (guardado) return guardado

  const reta: Trajeto = {
    pontos: [
      [origem.lat, origem.lng],
      [destino.lat, destino.lng]
    ],
    estimado: true
  }

  // Com mar pelo meio, a viagem tem duas partes: a estrada até ao aeroporto,
  // que é a que conta para os km, e o voo. Mostrar uma linha reta única
  // escondia justamente a parte que interessa ao coordenador.
  if (exigeAviao(origem, destino)) {
    const aeroporto = aeroportoDePartida(origem)
    if (!aeroporto) {
      trajetos.set(chave, reta)
      return reta
    }
    const ateAoAeroporto = await obterTrajeto(origem, { lat: aeroporto.lat, lng: aeroporto.lng })
    const comVoo: Trajeto = {
      ...ateAoAeroporto,
      aeroporto: {
        nome: aeroporto.nome,
        codigo: aeroporto.codigo,
        lat: aeroporto.lat,
        lng: aeroporto.lng
      },
      voo: [
        [aeroporto.lat, aeroporto.lng],
        [destino.lat, destino.lng]
      ]
    }
    trajetos.set(chave, comVoo)
    return comVoo
  }

  const base = lerConfig('geo.osrmUrl') ?? 'https://router.project-osrm.org'
  const coords = `${origem.lng},${origem.lat};${destino.lng},${destino.lat}`
  try {
    const resposta = await pedirJson<{
      code: string
      routes?: { geometry?: { coordinates?: [number, number][] } }[]
    }>(`${base}/route/v1/driving/${coords}?overview=simplified&geometries=geojson&alternatives=false`)
    const linha = resposta.routes?.[0]?.geometry?.coordinates
    if (resposta.code !== 'Ok' || !linha?.length) {
      trajetos.set(chave, reta)
      return reta
    }
    // O GeoJSON vem em (longitude, latitude); o mapa quer o contrário.
    const trajeto: Trajeto = { pontos: linha.map(([lng, lat]) => [lat, lng]), estimado: false }
    trajetos.set(chave, trajeto)
    return trajeto
  } catch {
    trajetos.set(chave, reta)
    return reta
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

  const resultado = await calcularDistancia(origem, destino)

  db.prepare(
    `INSERT INTO distancia_cache (delegado_id, recinto_id, km, minutos, fonte, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(delegado_id, recinto_id) DO UPDATE SET
       km = excluded.km, minutos = excluded.minutos, fonte = excluded.fonte,
       atualizado_em = excluded.atualizado_em`
  ).run(delegadoId, recintoId, resultado.km, resultado.minutos, resultado.fonte, new Date().toISOString())

  return resultado
}

/**
 * Distância a contabilizar entre dois pontos.
 *
 * Quando há mar pelo meio, só contam os quilómetros de casa até ao aeroporto e
 * de volta: o voo não é estrada percorrida pelo delegado, e contá-lo arruinava
 * o equilíbrio de quem calhasse ir a uma ilha.
 */
export async function calcularDistancia(
  origem: Coordenadas,
  destino: Coordenadas
): Promise<ResultadoDistancia> {
  const fator = Number(lerConfig('geo.fatorHaversine') ?? '1.25')

  const porEstrada = async (a: Coordenadas, b: Coordenadas): Promise<{ km: number; minutos: number | null; estimado: boolean }> => {
    const rota = await distanciaRodoviaria(a, b)
    return rota
      ? { km: rota.km, minutos: rota.minutos, estimado: false }
      : { km: haversineKm(a, b) * fator, minutos: null, estimado: true }
  }

  if (exigeAviao(origem, destino)) {
    const aeroporto = aeroportoDePartida(origem)
    if (aeroporto) {
      const ate = await porEstrada(origem, aeroporto)
      return { km: ate.km, minutos: ate.minutos, fonte: 'AVIAO' }
    }
    // Sem aeroporto conhecido na região do delegado não se inventa nada.
    return { km: 0, minutos: null, fonte: 'AVIAO' }
  }

  const estrada = await porEstrada(origem, destino)
  return {
    km: estrada.km,
    minutos: estrada.minutos,
    fonte: estrada.estimado ? 'HAVERSINE' : 'OSRM'
  }
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
