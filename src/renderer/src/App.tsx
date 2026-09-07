import { useCallback, useEffect, useState } from 'react'
import type { InfoAplicacao } from '@shared/api'
import type { Alerta } from '@shared/tipos'
import Alertas from './screens/Alertas'
import ClubesRecintos from './screens/ClubesRecintos'
import Dashboard from './screens/Dashboard'
import Definicoes from './screens/Definicoes'
import Delegados from './screens/Delegados'
import Importacao from './screens/Importacao'
import Nomeacoes from './screens/Nomeacoes'
import { classes } from './lib/formato'

type Ecra = 'nomeacoes' | 'delegados' | 'clubes' | 'importacao' | 'dashboard' | 'alertas' | 'definicoes'

const MENU: { chave: Ecra; etiqueta: string; icone: string }[] = [
  { chave: 'nomeacoes', etiqueta: 'Nomeações', icone: '📋' },
  { chave: 'dashboard', etiqueta: 'Dashboard', icone: '📊' },
  { chave: 'alertas', etiqueta: 'Alertas', icone: '🔔' },
  { chave: 'delegados', etiqueta: 'Delegados', icone: '👤' },
  { chave: 'clubes', etiqueta: 'Clubes e recintos', icone: '🏟️' },
  { chave: 'importacao', etiqueta: 'Importação', icone: '⬇️' },
  { chave: 'definicoes', etiqueta: 'Definições', icone: '⚙️' }
]

export default function App(): JSX.Element {
  const [ecra, setEcra] = useState<Ecra>('nomeacoes')
  const [info, setInfo] = useState<InfoAplicacao | null>(null)
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [aviso, setAviso] = useState<Alerta[] | null>(null)

  const recarregarAlertas = useCallback(async () => {
    setAlertas(await window.api.alertas.listar(false))
  }, [])

  useEffect(() => {
    void window.api.app.info().then(setInfo)
    void recarregarAlertas()

    // A atualização automática corre em segundo plano; quando traz novidades,
    // aparece um aviso flutuante em vez de mudar de ecrã por baixo do pé.
    const largarAlertas = window.api.alertas.aoChegar((novos) => {
      void recarregarAlertas()
      setAviso(novos)
    })
    const largarSync = window.api.sync.aoConcluir(() => void recarregarAlertas())
    return () => {
      largarAlertas()
      largarSync()
    }
  }, [recarregarAlertas])

  const porLer = alertas.filter((a) => !a.lido).length
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
            {m.chave === 'alertas' && porLer > 0 && <span className="contador">{porLer}</span>}
          </button>
        ))}
        <div className="rodape">
          v{info?.versao ?? '—'}
          <br />
          Atualiza de hora a hora
        </div>
      </nav>

      <main className="conteudo">
        {ecra === 'nomeacoes' && <Nomeacoes tilesUrl={tilesUrl} />}
        {ecra === 'dashboard' && <Dashboard />}
        {ecra === 'alertas' && <Alertas alertas={alertas} aoMudar={setAlertas} />}
        {ecra === 'delegados' && <Delegados tilesUrl={tilesUrl} />}
        {ecra === 'clubes' && <ClubesRecintos tilesUrl={tilesUrl} />}
        {ecra === 'importacao' && <Importacao />}
        {ecra === 'definicoes' && <Definicoes />}
      </main>

      {aviso && aviso.length > 0 && (
        <div className="notificacao">
          <div className="linha" style={{ marginBottom: 6 }}>
            <b>
              {aviso.length === 1 ? '1 alteração nos jogos' : `${aviso.length} alterações nos jogos`}
            </b>
            <div style={{ marginLeft: 'auto' }} />
            <button className="botao pequeno" onClick={() => setAviso(null)}>
              Fechar
            </button>
          </div>
          <ul style={{ margin: '0 0 8px 16px', padding: 0 }}>
            {aviso.slice(0, 3).map((a) => (
              <li key={a.id}>
                <b>{a.descricao}</b> — {a.detalhe}
              </li>
            ))}
          </ul>
          {aviso.length > 3 && <div className="silencioso">e mais {aviso.length - 3}…</div>}
          <button
            className="botao primario pequeno"
            onClick={() => {
              setEcra('alertas')
              setAviso(null)
            }}
          >
            Ver alertas
          </button>
        </div>
      )}
    </div>
  )
}
