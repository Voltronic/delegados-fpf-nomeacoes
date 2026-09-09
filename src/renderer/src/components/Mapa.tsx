import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'

export interface PontoMapa {
  id: number
  lat: number
  lng: number
  etiqueta: string
  titulo: string
  /** Determina a cor do pino. `nomeado` é quem já vai a este jogo. */
  classe: 'top' | 'medio' | 'baixo' | 'bloqueado' | 'nomeado'
}

/** Caminho de um delegado nomeado até ao recinto. */
export interface TrajetoMapa {
  pontos: [number, number][]
  /** Linha reta em vez de estrada: sem rede, ou com mar pelo meio. */
  estimado: boolean
}

export interface PropsMapa {
  tilesUrl: string
  recinto: { lat: number; lng: number; titulo: string } | null
  pontos: PontoMapa[]
  /** Viagens a desenhar — as dos delegados já nomeados para este jogo. */
  trajetos?: TrajetoMapa[]
  realcado: number | null
  aoSelecionar?: (id: number) => void
  aoRealcar?: (id: number | null) => void
}

/**
 * Mapa do jogo: pino do recinto mais os delegados, coloridos pela posição no
 * ranking. É por aqui que o coordenador percebe de relance a geografia da
 * nomeação — quem está perto, quem vem de longe, e onde ficam os bloqueados.
 */
export default function Mapa({
  tilesUrl,
  recinto,
  pontos,
  trajetos = [],
  realcado,
  aoSelecionar,
  aoRealcar
}: PropsMapa): JSX.Element {
  const contentor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const marcadores = useRef<Map<number, L.Marker>>(new Map())

  // As funções e o array de pontos são recriados a cada render de quem nos usa.
  // Se o efeito que redesenha dependesse deles, passar o rato num pino voltava a
  // correr o `fitBounds` e desfazia o zoom que a pessoa tinha feito.
  const aoSelecionarRef = useRef(aoSelecionar)
  const aoRealcarRef = useRef(aoRealcar)
  aoSelecionarRef.current = aoSelecionar
  aoRealcarRef.current = aoRealcar

  // Só o conteúdo conta: enquanto os pontos forem os mesmos, o mapa não mexe.
  const assinatura = useMemo(
    () =>
      JSON.stringify({
        recinto: recinto ? [recinto.lat, recinto.lng, recinto.titulo] : null,
        pontos: pontos.map((p) => [p.id, p.lat, p.lng, p.etiqueta, p.classe, p.titulo]),
        trajetos: trajetos.map((t) => [t.estimado, t.pontos.length, t.pontos[0], t.pontos.at(-1)])
      }),
    [recinto, pontos, trajetos]
  )

  useEffect(() => {
    if (!contentor.current || mapa.current) return
    mapa.current = L.map(contentor.current, {
      zoomControl: true,
      attributionControl: true,
      /*
       * Sem animação de zoom, de propósito. Com ela, mudar de ecrã logo a
       * seguir a um zoom deixava a transição a meio: o Leaflet corria depois o
       * `_onZoomTransitionEnd` sobre um mapa já destruído e rebentava em
       * `getPosition` (o painel do mapa já não existia). Num painel lateral
       * como este a animação não acrescenta nada, e sem ela o zoom é imediato.
       */
      zoomAnimation: false
    }).setView([39.6, -8.0], 6)
    L.tileLayer(tilesUrl, {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(mapa.current)
    camada.current = L.layerGroup().addTo(mapa.current)

    // Espelha o nível de zoom num atributo do DOM. É o que permite à
    // verificação automática medir o zoom real do Leaflet sem depender dos
    // tiles, que numa janela oculta não chegam a ser recarregados.
    const marcarZoom = (): void => {
      contentor.current?.setAttribute('data-zoom', String(mapa.current?.getZoom() ?? ''))
    }
    mapa.current.on('zoom zoomend', marcarZoom)
    marcarZoom()

    return () => {
      // Fecha-se tudo antes de destruir, para não ficarem elementos do mapa
      // agarrados a marcadores que já não existem.
      for (const marcador of marcadores.current.values()) marcador.closeTooltip()
      marcadores.current.clear()
      camada.current?.clearLayers()
      mapa.current?.remove()
      mapa.current = null
      camada.current = null
    }
  }, [tilesUrl])

  useEffect(() => {
    const m = mapa.current
    const grupo = camada.current
    if (!m || !grupo) return

    // Fechar as tooltips antes de limpar os marcadores: uma tooltip aberta
    // sobre um marcador que deixa de existir fica órfã no mapa.
    for (const marcador of marcadores.current.values()) marcador.closeTooltip()
    grupo.clearLayers()
    marcadores.current.clear()

    const coordenadas: L.LatLngExpression[] = []

    for (const trajeto of trajetos) {
      if (trajeto.pontos.length < 2) continue
      // A linha reta vai a tracejado: é uma estimativa, não o caminho real.
      L.polyline(trajeto.pontos, {
        color: '#b3261e',
        weight: trajeto.estimado ? 2 : 3,
        opacity: 0.75,
        dashArray: trajeto.estimado ? '6 6' : undefined
      })
        .bindTooltip(trajeto.estimado ? 'Traçado aproximado (linha reta)' : 'Viagem por estrada')
        .addTo(grupo)
      for (const ponto of trajeto.pontos) coordenadas.push(ponto)
    }

    if (recinto) {
      const icone = L.divIcon({
        className: '',
        html: '<div class="pino recinto" title="Recinto">⚽</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
      L.marker([recinto.lat, recinto.lng], { icon: icone, zIndexOffset: 1000 })
        .bindTooltip(recinto.titulo, { direction: 'top' })
        .addTo(grupo)
      coordenadas.push([recinto.lat, recinto.lng])
    }

    for (const ponto of pontos) {
      const icone = L.divIcon({
        className: '',
        html: `<div class="pino ${ponto.classe}">${ponto.etiqueta}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })
      const marcador = L.marker([ponto.lat, ponto.lng], { icon: icone })
        .bindTooltip(ponto.titulo, { direction: 'top' })
        .addTo(grupo)
      marcador.on('click', () => aoSelecionarRef.current?.(ponto.id))
      marcador.on('mouseover', () => aoRealcarRef.current?.(ponto.id))
      marcador.on('mouseout', () => aoRealcarRef.current?.(null))
      marcadores.current.set(ponto.id, marcador)
      coordenadas.push([ponto.lat, ponto.lng])
    }

    if (coordenadas.length > 1) {
      m.fitBounds(L.latLngBounds(coordenadas).pad(0.18))
    } else if (coordenadas.length === 1) {
      m.setView(coordenadas[0], 11)
    }
    // Depende só da assinatura: redesenha e reenquadra quando os pontos mudam
    // de facto (outro jogo, outro delegado), nunca por causa de um realce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura])

  // Realce sincronizado com a lista de candidatos.
  useEffect(() => {
    for (const [id, marcador] of marcadores.current) {
      // Fechar a tooltip de todos menos o realçado: sem isto, passar o rato por
      // vários candidatos deixava o mapa cheio de balões abertos, porque nada
      // fechava o do candidato anterior.
      if (id !== realcado) marcador.closeTooltip()
      const elemento = marcador.getElement()
      if (!elemento) continue
      elemento.style.transform =
        `${elemento.style.transform.replace(/ scale\([^)]*\)/, '')}${id === realcado ? ' scale(1.45)' : ''}`
      elemento.style.zIndex = id === realcado ? '900' : ''
    }
    // Só se abre a tooltip de um marcador que esteja mesmo desenhado; a lista de
    // jogos muda por baixo e o realce pode apontar para um pino que já saiu.
    const realce = realcado != null ? marcadores.current.get(realcado) : undefined
    if (realce?.getElement()) realce.openTooltip()
  }, [realcado])

  // Redimensionar quando o painel muda de tamanho.
  useEffect(() => {
    if (!contentor.current) return
    const observador = new ResizeObserver(() => mapa.current?.invalidateSize())
    observador.observe(contentor.current)
    return () => observador.disconnect()
  }, [])

  return <div className="mapa" ref={contentor} />
}
