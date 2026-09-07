import { useCallback, useEffect, useState } from 'react'
import type { RecintoDoClubeApi } from '@shared/api'
import type { Clube, Competicao, Recinto } from '@shared/tipos'
import Mapa from '../components/Mapa'
import { classes } from '../lib/formato'

interface Props {
  tilesUrl: string
}

export default function ClubesRecintos({ tilesUrl }: Props): JSX.Element {
  const [aba, setAba] = useState<'clubes' | 'recintos'>('clubes')
  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Clubes e recintos</h1>
        <div className="grupo-botoes">
          <button className={classes(aba === 'clubes' && 'ativo')} onClick={() => setAba('clubes')}>
            Clubes
          </button>
          <button className={classes(aba === 'recintos' && 'ativo')} onClick={() => setAba('recintos')}>
            Recintos
          </button>
        </div>
        <div className="subtitulo">
          O recinto de um clube pode ser diferente por competição — o mais específico ganha.
        </div>
      </div>
      <div className="corpo-ecra sem-padding">
        {aba === 'clubes' ? <PainelClubes /> : <PainelRecintos tilesUrl={tilesUrl} />}
      </div>
    </>
  )
}

function PainelClubes(): JSX.Element {
  const [clubes, setClubes] = useState<Clube[]>([])
  const [recintos, setRecintos] = useState<Recinto[]>([])
  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [associacoes, setAssociacoes] = useState<RecintoDoClubeApi[]>([])
  const [filtro, setFiltro] = useState('')
  const [novoNome, setNovoNome] = useState('')

  const [competicaoId, setCompeticaoId] = useState<number | ''>('')
  const [recintoId, setRecintoId] = useState<number | ''>('')

  const carregar = useCallback(async () => {
    setClubes(await window.api.clubes.listar())
    setRecintos(await window.api.recintos.listar())
    setCompeticoes(await window.api.competicoes.listar())
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    if (selecionado == null) return
    void window.api.clubes.recintos(selecionado).then(setAssociacoes)
  }, [selecionado])

  async function associar(): Promise<void> {
    if (selecionado == null || recintoId === '') return
    setAssociacoes(
      await window.api.clubes.definirRecinto({
        clubeId: selecionado,
        competicaoId: competicaoId === '' ? null : competicaoId,
        recintoId
      })
    )
    setRecintoId('')
  }

  const visiveis = clubes.filter((c) => c.nome.toLowerCase().includes(filtro.toLowerCase()))
  const clube = clubes.find((c) => c.id === selecionado)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%', minHeight: 0 }}>
      <div className="painel">
        <div className="painel-cabecalho">
          <input
            type="search"
            placeholder="Procurar clube…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <div className="painel-corpo">
          {visiveis.map((c) => (
            <div
              key={c.id}
              className={classes('item-jogo', c.id === selecionado && 'selecionado')}
              onClick={() => setSelecionado(c.id)}
            >
              <div className="equipas">{c.nome}</div>
            </div>
          ))}
          {visiveis.length === 0 && (
            <div className="vazio">
              Nenhum clube. Aparecem automaticamente ao importar jogos, ou pode criar aqui.
            </div>
          )}
        </div>
        <div className="painel-cabecalho" style={{ borderTop: '1px solid var(--borda)', borderBottom: 'none' }}>
          <div className="linha">
            <input
              type="text"
              placeholder="Novo clube"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
            />
            <button
              className="botao"
              onClick={async () => {
                if (!novoNome.trim()) return
                setClubes(await window.api.clubes.guardar({ nome: novoNome.trim(), notas: null }))
                setNovoNome('')
              }}
            >
              Criar
            </button>
          </div>
        </div>
      </div>

      <div className="corpo-ecra">
        {!clube ? (
          <div className="vazio">Selecione um clube.</div>
        ) : (
          <>
            <div className="cartao">
              <h2>{clube.nome}</h2>
              <div className="linha-campos">
                <label className="campo" style={{ flex: '2 1 260px' }}>
                  Nome
                  <input
                    type="text"
                    defaultValue={clube.nome}
                    key={clube.id}
                    onBlur={async (e) => {
                      if (e.target.value.trim() && e.target.value !== clube.nome) {
                        setClubes(
                          await window.api.clubes.guardar({
                            id: clube.id,
                            nome: e.target.value.trim(),
                            notas: clube.notas
                          })
                        )
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="cartao">
              <h2>Recintos deste clube</h2>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Competição</th>
                    <th>Recinto</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {associacoes.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.competicaoNome ?? <span className="emblema neutro">Por omissão</span>}
                      </td>
                      <td>{a.recintoNome}</td>
                      <td style={{ width: 1 }}>
                        <button
                          className="botao pequeno perigo"
                          onClick={async () =>
                            setAssociacoes(await window.api.clubes.apagarRecinto(a.id, clube.id))
                          }
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                  {associacoes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="silencioso">
                        Sem recinto associado — os jogos em casa ficam sem distâncias.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="linha-campos" style={{ marginTop: 12 }}>
                <label className="campo">
                  Competição
                  <select
                    value={competicaoId}
                    onChange={(e) => setCompeticaoId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">Por omissão (todas)</option>
                    {competicoes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo" style={{ flex: '2 1 240px' }}>
                  Recinto
                  <select
                    value={recintoId}
                    onChange={(e) => setRecintoId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">Escolher…</option>
                    {recintos.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome}
                        {r.lat == null ? ' (sem coordenadas)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="botao" style={{ flex: '0 0 auto' }} onClick={associar}>
                  Associar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PainelRecintos({ tilesUrl }: { tilesUrl: string }): JSX.Element {
  const [recintos, setRecintos] = useState<Recinto[]>([])
  const [selecionado, setSelecionado] = useState<number | 'novo' | null>(null)
  const [form, setForm] = useState<{
    id?: number
    nome: string
    morada: string | null
    lat: number | null
    lng: number | null
    coordsManuais: boolean
  }>({ nome: '', morada: null, lat: null, lng: null, coordsManuais: false })
  const [filtro, setFiltro] = useState('')
  const [aGeocodificar, setAGeocodificar] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)

  useEffect(() => {
    void window.api.recintos.listar().then(setRecintos)
  }, [])

  useEffect(() => {
    if (selecionado === 'novo') {
      setForm({ nome: '', morada: null, lat: null, lng: null, coordsManuais: false })
      return
    }
    const r = recintos.find((x) => x.id === selecionado)
    if (r) setForm(r)
  }, [selecionado, recintos])

  async function guardar(): Promise<void> {
    if (!form.nome.trim()) return
    setRecintos(await window.api.recintos.guardar(form))
    setMensagem(null)
  }

  async function localizar(): Promise<void> {
    if (typeof selecionado !== 'number') return
    setAGeocodificar(true)
    try {
      const r = await window.api.recintos.geocodificar(selecionado)
      if (r) {
        setForm(r)
        setRecintos(await window.api.recintos.listar())
        setMensagem(null)
      } else {
        setMensagem('Não foi encontrado. Escreva a morada completa ou introduza as coordenadas.')
      }
    } finally {
      setAGeocodificar(false)
    }
  }

  const semCoordenadas = recintos.filter((r) => r.lat == null).length
  const visiveis = recintos.filter((r) => r.nome.toLowerCase().includes(filtro.toLowerCase()))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', height: '100%', minHeight: 0 }}>
      <div className="painel">
        <div className="painel-cabecalho">
          <input
            type="search"
            placeholder="Procurar recinto…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          {semCoordenadas > 0 && (
            <div className="emblema alerta" style={{ marginTop: 8 }}>
              {semCoordenadas} sem coordenadas
            </div>
          )}
        </div>
        <div className="painel-corpo">
          {visiveis.map((r) => (
            <div
              key={r.id}
              className={classes('item-jogo', r.id === selecionado && 'selecionado')}
              onClick={() => setSelecionado(r.id)}
            >
              <div className="equipas">{r.nome}</div>
              <div className="local">{r.morada ?? 'sem morada'}</div>
              {r.lat == null && <span className="emblema alerta">Sem coordenadas</span>}
            </div>
          ))}
        </div>
        <div className="painel-cabecalho" style={{ borderTop: '1px solid var(--borda)', borderBottom: 'none' }}>
          <button className="botao" onClick={() => setSelecionado('novo')}>
            Novo recinto
          </button>
        </div>
      </div>

      <div className="corpo-ecra">
        {selecionado == null ? (
          <div className="vazio">Selecione um recinto.</div>
        ) : (
          <div className="cartao">
            <h2>{form.nome || 'Novo recinto'}</h2>
            {mensagem && <div className="aviso-caixa alerta">{mensagem}</div>}
            <div className="pilha">
              <label className="campo">
                Nome
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </label>
              <label className="campo">
                Morada
                <input
                  type="text"
                  value={form.morada ?? ''}
                  onChange={(e) => setForm({ ...form, morada: e.target.value || null })}
                />
              </label>
              <div className="linha-campos">
                <label className="campo estreito">
                  Latitude
                  <input
                    type="number"
                    step="0.000001"
                    value={form.lat ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lat: e.target.value === '' ? null : Number(e.target.value),
                        coordsManuais: true
                      })
                    }
                  />
                </label>
                <label className="campo estreito">
                  Longitude
                  <input
                    type="number"
                    step="0.000001"
                    value={form.lng ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lng: e.target.value === '' ? null : Number(e.target.value),
                        coordsManuais: true
                      })
                    }
                  />
                </label>
                <div style={{ flex: '1 1 auto' }}>
                  <button
                    className="botao"
                    onClick={localizar}
                    disabled={aGeocodificar || typeof selecionado !== 'number'}
                  >
                    {aGeocodificar ? 'A procurar…' : 'Localizar'}
                  </button>
                </div>
              </div>
              <div style={{ height: 300, display: 'flex' }}>
                <Mapa
                  tilesUrl={tilesUrl}
                  realcado={null}
                  recinto={
                    form.lat != null && form.lng != null
                      ? { lat: form.lat, lng: form.lng, titulo: form.nome }
                      : null
                  }
                  pontos={[]}
                />
              </div>
              <div className="linha">
                <button className="botao primario" onClick={guardar}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
