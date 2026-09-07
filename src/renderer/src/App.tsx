import { useEffect, useState } from 'react'
import type { InfoAplicacao } from '@shared/api'
import ClubesRecintos from './screens/ClubesRecintos'
import Dashboard from './screens/Dashboard'
import Definicoes from './screens/Definicoes'
import Delegados from './screens/Delegados'
import Importacao from './screens/Importacao'
import Nomeacoes from './screens/Nomeacoes'
import { classes } from './lib/formato'

type Ecra = 'nomeacoes' | 'delegados' | 'clubes' | 'importacao' | 'dashboard' | 'definicoes'

const MENU: { chave: Ecra; etiqueta: string; icone: string }[] = [
  { chave: 'nomeacoes', etiqueta: 'Nomeações', icone: '📋' },
  { chave: 'dashboard', etiqueta: 'Dashboard', icone: '📊' },
  { chave: 'delegados', etiqueta: 'Delegados', icone: '👤' },
  { chave: 'clubes', etiqueta: 'Clubes e recintos', icone: '🏟️' },
  { chave: 'importacao', etiqueta: 'Importação', icone: '⬇️' },
  { chave: 'definicoes', etiqueta: 'Definições', icone: '⚙️' }
]

export default function App(): JSX.Element {
  const [ecra, setEcra] = useState<Ecra>('nomeacoes')
  const [info, setInfo] = useState<InfoAplicacao | null>(null)

  useEffect(() => {
    void window.api.app.info().then(setInfo)
  }, [])

  const tilesUrl = info?.tilesUrl ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

  return (
    <div className="aplicacao">
      <nav className="barra-lateral">
        <div className="marca">
          Nomeações de Delegados
          <small>Competições nacionais FPF</small>
        </div>
        {MENU.map((m) => (
          <button key={m.chave} className={classes(ecra === m.chave && 'ativo')} onClick={() => setEcra(m.chave)}>
            <span aria-hidden>{m.icone}</span>
            {m.etiqueta}
          </button>
        ))}
        <div className="rodape">
          v{info?.versao ?? '—'}
          <br />
          Dados em <code>{info ? 'data/' : '—'}</code>
        </div>
      </nav>

      <main className="conteudo">
        {ecra === 'nomeacoes' && <Nomeacoes tilesUrl={tilesUrl} />}
        {ecra === 'dashboard' && <Dashboard />}
        {ecra === 'delegados' && <Delegados tilesUrl={tilesUrl} />}
        {ecra === 'clubes' && <ClubesRecintos tilesUrl={tilesUrl} />}
        {ecra === 'importacao' && <Importacao />}
        {ecra === 'definicoes' && <Definicoes />}
      </main>
    </div>
  )
}
