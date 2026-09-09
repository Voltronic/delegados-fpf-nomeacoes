import { useEffect, useState } from 'react'
import Mapa, { type PontoMapa, type TrajetoMapa } from './components/Mapa'

interface EstadoMapa {
  tilesUrl: string
  recinto: { lat: number; lng: number; titulo: string } | null
  pontos: PontoMapa[]
  trajetos: TrajetoMapa[]
  realcado: number | null
  legenda: string
}

/**
 * O mapa quando está numa janela só dele.
 *
 * Não sabe nada por si: recebe do ecrã principal o que há para desenhar e
 * devolve os cliques. Assim não há dois sítios a decidir o que é o "jogo
 * selecionado", que é como as duas janelas acabariam a mostrar coisas
 * diferentes.
 */
export default function JanelaMapa(): JSX.Element {
  const [estado, setEstado] = useState<EstadoMapa | null>(null)

  useEffect(() => {
    // Pedir primeiro: quando esta janela abre, o ecrã principal já mandou o
    // estado, e essa mensagem chegou antes de haver quem a ouvisse.
    void window.api.mapa.estadoAtual().then((inicial) => {
      if (inicial) setEstado(inicial as EstadoMapa)
    })
    return window.api.mapa.aoReceberEstado((novo) => setEstado(novo as EstadoMapa))
  }, [])

  return (
    <div className="janela-mapa">
      <div className="painel-cabecalho">
        <h2>Mapa</h2>
        <div className="silencioso" style={{ marginTop: 3 }}>
          {estado?.legenda ?? 'à espera do ecrã principal…'}
        </div>
        <div className="espacador" style={{ marginLeft: 'auto' }} />
        <button className="botao pequeno" onClick={() => window.api.mapa.juntar()}>
          Voltar ao ecrã principal
        </button>
      </div>

      <div className="painel-corpo" style={{ display: 'flex', flexDirection: 'column' }}>
        {estado ? (
          <Mapa
            tilesUrl={estado.tilesUrl}
            recinto={estado.recinto}
            pontos={estado.pontos}
            trajetos={estado.trajetos}
            realcado={estado.realcado}
            aoSelecionar={(id) => window.api.mapa.realcar(id)}
            aoRealcar={(id) => window.api.mapa.realcar(id)}
          />
        ) : (
          <div className="vazio">Selecione um jogo no ecrã principal.</div>
        )}
      </div>
    </div>
  )
}
