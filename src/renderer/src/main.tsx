import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import JanelaMapa from './JanelaMapa'
import './estilos.css'

// A janela do mapa é a mesma página, aberta com `#mapa`. Evita um segundo
// empacotamento só para desenhar o que já se sabe desenhar.
const soMapa = window.location.hash === '#mapa'

createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode>{soMapa ? <JanelaMapa /> : <App />}</React.StrictMode>
)
