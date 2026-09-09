import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import JanelaMapa from './JanelaMapa'
import Splash from './Splash'
import './estilos.css'

// As janelas auxiliares são a mesma página, abertas com um `hash`. Evita um
// segundo empacotamento só para desenhar o que já se sabe desenhar.
const pagina = window.location.hash

createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode>
    {pagina === '#mapa' ? <JanelaMapa /> : pagina === '#splash' ? <Splash /> : <App />}
  </React.StrictMode>
)
