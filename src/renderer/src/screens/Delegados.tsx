import { useCallback, useEffect, useState } from 'react'
import type { Clube, Delegado, Indisponibilidade, NivelDelegado, VetoClube } from '@shared/tipos'
import Mapa from '../components/Mapa'
import { classes, formatarData } from '../lib/formato'
import { avisar, guardarCom } from '../lib/avisos'

const VAZIO: Omit<Delegado, 'id'> = {
  numero: '',
  nome: '',
  morada: '',
  lat: null,
  lng: null,
  nivel: 'PRINCIPAL',
  telefone: null,
  email: null,
  ativo: true,
  notas: null,
  coordsManuais: false
}

interface Props {
  tilesUrl: string
}

export default function Delegados({ tilesUrl }: Props): JSX.Element {
  const [delegados, setDelegados] = useState<Delegado[]>([])
  const [clubes, setClubes] = useState<Clube[]>([])
  const [selecionado, setSelecionado] = useState<number | 'novo' | null>(null)
  const [formulario, setFormulario] = useState<Omit<Delegado, 'id'> & { id?: number }>(VAZIO)
  const [indisponibilidades, setIndisponibilidades] = useState<Indisponibilidade[]>([])
  const [vetos, setVetos] = useState<VetoClube[]>([])
  const [aGeocodificar, setAGeocodificar] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [procura, setProcura] = useState('')
  const [aProcurar, setAProcurar] = useState(false)
  const [candidatos, setCandidatos] = useState<
    { lat: number; lng: number; moradaResolvida: string; categoria: string }[] | null
  >(null)

  async function procurarLocal(): Promise<void> {
    if (!procura.trim()) return
    setAProcurar(true)
    try {
      setCandidatos(await window.api.geo.procurar(procura))
    } finally {
      setAProcurar(false)
    }
  }

  const carregar = useCallback(async () => {
    setDelegados(await window.api.delegados.listar(true))
  }, [])

  useEffect(() => {
    void carregar()
    void window.api.clubes.listar().then(setClubes)
  }, [carregar])

  useEffect(() => {
    if (selecionado === 'novo') {
      setFormulario({ ...VAZIO })
      setIndisponibilidades([])
      setVetos([])
      return
    }
    if (selecionado == null) return
    const d = delegados.find((x) => x.id === selecionado)
    if (!d) return
    setFormulario(d)
    void window.api.delegados.indisponibilidades(d.id).then(setIndisponibilidades)
    void window.api.delegados.vetos(d.id).then(setVetos)
  }, [selecionado, delegados])

  async function guardar(): Promise<void> {
    if (!formulario.numero.trim() || !formulario.nome.trim()) {
      avisar('O número e o nome são obrigatórios.', 'erro')
      return
    }
    const guardado = await guardarCom(
      () => window.api.delegados.guardar(formulario),
      `${formulario.nome} guardado.`
    )
    if (!guardado) return
    await carregar()
    setSelecionado(guardado.id)
    setMensagem(null)
  }

  async function apagar(): Promise<void> {
    if (typeof selecionado !== 'number') return
    if (!confirm('Apagar este delegado e todas as suas nomeações?')) return
    const nome = formulario.nome
    const ok = await guardarCom(
      () => window.api.delegados.apagar(selecionado),
      `${nome} apagado.`
    )
    if (ok === null) return
    setSelecionado(null)
    await carregar()
  }

  async function geocodificar(): Promise<void> {
    if (typeof selecionado !== 'number') return
    setAGeocodificar(true)
    try {
      const atualizado = await window.api.delegados.geocodificar(selecionado)
      if (atualizado) {
        setFormulario(atualizado)
        await carregar()
        setMensagem(null)
        avisar('Morada localizada e guardada.')
      } else {
        avisar('A morada não foi encontrada. Cole o link do Google Maps ou escreva a localidade.', 'erro')
      }
    } finally {
      setAGeocodificar(false)
    }
  }

  const editar = <K extends keyof Delegado>(campo: K, valor: Delegado[K]): void =>
    setFormulario((f) => ({ ...f, [campo]: valor }))

  const semCoordenadas = delegados.filter((d) => d.ativo && (d.lat == null || d.lng == null)).length

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Delegados</h1>
        <div className="subtitulo">
          {delegados.filter((d) => d.ativo).length} ativos de {delegados.length}
          {semCoordenadas > 0 && ` · ${semCoordenadas} sem morada geocodificada`}
        </div>
        <div className="espacador" />
        <button className="botao primario" onClick={() => setSelecionado('novo')}>
          Novo delegado
        </button>
      </div>

      <div className="corpo-ecra sem-padding">
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%', minHeight: 0 }}>
          <div className="painel">
            <div className="painel-cabecalho">
              <h2>Lista</h2>
            </div>
            <div className="painel-corpo">
              {delegados.map((d) => (
                <div
                  key={d.id}
                  className={classes('item-jogo', d.id === selecionado && 'selecionado')}
                  onClick={() => setSelecionado(d.id)}
                >
                  <div className="equipas">
                    <span className="mono silencioso">{d.numero}</span> {d.nome}
                  </div>
                  <div className="linha">
                    <span className={classes('emblema', d.nivel === 'ELITE' ? 'elite' : 'principal')}>
                      {d.nivel === 'ELITE' ? 'Elite' : 'Principal'}
                    </span>
                    {!d.ativo && <span className="emblema neutro">Inativo</span>}
                    {(d.lat == null || d.lng == null) && <span className="emblema alerta">Sem coordenadas</span>}
                  </div>
                  <div className="local">{d.morada || 'sem morada'}</div>
                </div>
              ))}
              {delegados.length === 0 && <div className="vazio">Ainda não há delegados.</div>}
            </div>
          </div>

          <div className="corpo-ecra">
            {selecionado == null ? (
              <div className="vazio">Selecione um delegado ou crie um novo.</div>
            ) : (
              <>
                {mensagem && <div className="aviso-caixa erro">{mensagem}</div>}

                <div className="cartao">
                  <h2>Identificação</h2>
                  <div className="pilha">
                    <div className="linha-campos">
                      <label className="campo estreito">
                        Número
                        <input
                          type="text"
                          value={formulario.numero}
                          onChange={(e) => editar('numero', e.target.value)}
                        />
                      </label>
                      <label className="campo" style={{ flex: '2 1 240px' }}>
                        Nome
                        <input type="text" value={formulario.nome} onChange={(e) => editar('nome', e.target.value)} />
                      </label>
                      <label className="campo estreito">
                        Nível
                        <select
                          value={formulario.nivel}
                          onChange={(e) => editar('nivel', e.target.value as NivelDelegado)}
                        >
                          <option value="PRINCIPAL">Principal</option>
                          <option value="ELITE">Elite</option>
                        </select>
                      </label>
                      <label className="campo estreito">
                        Estado
                        <select
                          value={formulario.ativo ? '1' : '0'}
                          onChange={(e) => editar('ativo', e.target.value === '1')}
                        >
                          <option value="1">Ativo</option>
                          <option value="0">Inativo</option>
                        </select>
                      </label>
                    </div>
                    <div className="linha-campos">
                      <label className="campo">
                        Telefone (opcional)
                        <input
                          type="text"
                          value={formulario.telefone ?? ''}
                          onChange={(e) => editar('telefone', e.target.value || null)}
                        />
                      </label>
                      <label className="campo">
                        Email (opcional)
                        <input
                          type="email"
                          value={formulario.email ?? ''}
                          onChange={(e) => editar('email', e.target.value || null)}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="cartao">
                  <h2>Morada e localização</h2>
                  <div className="pilha">
                    <label className="campo">
                      Morada
                      <input
                        type="text"
                        placeholder="Rua, localidade, concelho"
                        value={formulario.morada ?? ''}
                        onChange={(e) => editar('morada', e.target.value || null)}
                      />
                    </label>
                    <div className="linha-campos">
                      <label className="campo estreito">
                        Latitude
                        <input
                          type="number"
                          step="0.000001"
                          value={formulario.lat ?? ''}
                          onChange={(e) => {
                            editar('lat', e.target.value === '' ? null : Number(e.target.value))
                            editar('coordsManuais', true)
                          }}
                        />
                      </label>
                      <label className="campo estreito">
                        Longitude
                        <input
                          type="number"
                          step="0.000001"
                          value={formulario.lng ?? ''}
                          onChange={(e) => {
                            editar('lng', e.target.value === '' ? null : Number(e.target.value))
                            editar('coordsManuais', true)
                          }}
                        />
                      </label>
                      <div style={{ flex: '1 1 auto' }}>
                        <button
                          className="botao"
                          onClick={geocodificar}
                          disabled={aGeocodificar || typeof selecionado !== 'number' || !formulario.morada}
                        >
                          {aGeocodificar ? 'A procurar…' : 'Localizar pela morada'}
                        </button>
                        {formulario.coordsManuais && (
                          <span className="emblema neutro" style={{ marginLeft: 8 }}>
                            Coordenadas manuais
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="pilha" style={{ borderTop: '1px solid var(--borda)', paddingTop: 10 }}>
                      <div className="silencioso">
                        Cole aqui o link do Google Maps da casa do delegado — ou escreva a localidade e
                        escolha o resultado.
                      </div>
                      <div className="linha">
                        <input
                          type="search"
                          placeholder="link do Google Maps, ou Rua X, Braga"
                          value={procura}
                          onChange={(e) => setProcura(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void procurarLocal()
                          }}
                        />
                        <button
                          className="botao"
                          disabled={aProcurar || !procura.trim()}
                          onClick={procurarLocal}
                        >
                          {aProcurar ? 'A procurar…' : 'Procurar'}
                        </button>
                      </div>
                      {candidatos?.length === 0 && (
                        <div className="silencioso">
                          Nada encontrado. Tente a localidade, ou cole o link do Google Maps.
                        </div>
                      )}
                      {candidatos?.map((cand, i) => (
                        <div key={i} className="linha">
                          <span style={{ flex: '1 1 auto' }}>
                            {cand.moradaResolvida}{' '}
                            <span className="silencioso">({cand.categoria})</span>
                          </span>
                          <button
                            className="botao pequeno primario"
                            onClick={() => {
                              setFormulario((f) => ({
                                ...f,
                                lat: cand.lat,
                                lng: cand.lng,
                                morada: f.morada || cand.moradaResolvida,
                                coordsManuais: true
                              }))
                              setCandidatos(null)
                              setProcura('')
                            }}
                          >
                            Usar este
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ height: 240, display: 'flex' }}>
                      <Mapa
                        tilesUrl={tilesUrl}
                        recinto={null}
                        realcado={null}
                        pontos={
                          formulario.lat != null && formulario.lng != null
                            ? [
                                {
                                  id: 1,
                                  lat: formulario.lat,
                                  lng: formulario.lng,
                                  etiqueta: '●',
                                  titulo: formulario.nome || 'Delegado',
                                  classe: 'medio'
                                }
                              ]
                            : []
                        }
                      />
                    </div>
                    <div className="silencioso">
                      Se a morada não resolver bem, escreva as coordenadas à mão — ficam marcadas como manuais
                      e não são substituídas por futuras pesquisas.
                    </div>
                  </div>
                </div>

                {typeof selecionado === 'number' && (
                  <div className="grelha-2">
                    <Indisponibilidades
                      delegadoId={selecionado}
                      lista={indisponibilidades}
                      aoMudar={setIndisponibilidades}
                    />
                    <Vetos delegadoId={selecionado} clubes={clubes} lista={vetos} aoMudar={setVetos} />
                  </div>
                )}

                <div className="linha" style={{ marginTop: 4 }}>
                  <button className="botao primario" onClick={guardar}>
                    Guardar
                  </button>
                  <button className="botao" onClick={() => setSelecionado(null)}>
                    Fechar
                  </button>
                  <div style={{ marginLeft: 'auto' }} />
                  {typeof selecionado === 'number' && (
                    <button className="botao perigo" onClick={apagar}>
                      Apagar delegado
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Indisponibilidades({
  delegadoId,
  lista,
  aoMudar
}: {
  delegadoId: number
  lista: Indisponibilidade[]
  aoMudar: (l: Indisponibilidade[]) => void
}): JSX.Element {
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [motivo, setMotivo] = useState('')

  async function adicionar(): Promise<void> {
    if (!inicio || !fim) return
    const lista = await guardarCom(
      () =>
        window.api.delegados.criarIndisponibilidade({
          delegadoId,
          dataInicio: inicio,
          dataFim: fim,
          motivo: motivo || null
        }),
      'Indisponibilidade guardada.'
    )
    if (!lista) return
    aoMudar(lista)
    setInicio('')
    setFim('')
    setMotivo('')
  }

  return (
    <div className="cartao">
      <h2>Indisponibilidades</h2>
      <table className="tabela">
        <tbody>
          {lista.map((i) => (
            <tr key={i.id}>
              <td>
                {formatarData(i.dataInicio)} a {formatarData(i.dataFim)}
              </td>
              <td className="silencioso">{i.motivo ?? '—'}</td>
              <td style={{ width: 1 }}>
                <button
                  className="botao pequeno perigo"
                  onClick={async () => {
                    const lista = await guardarCom(
                      () => window.api.delegados.apagarIndisponibilidade(i.id, delegadoId),
                      'Indisponibilidade removida.'
                    )
                    if (lista) aoMudar(lista)
                  }}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
          {lista.length === 0 && (
            <tr>
              <td colSpan={3} className="silencioso">
                Sempre disponível.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="linha-campos" style={{ marginTop: 10 }}>
        <label className="campo">
          De
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="campo">
          Até
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
        <label className="campo">
          Motivo
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <button className="botao" style={{ flex: '0 0 auto' }} onClick={adicionar}>
          Adicionar
        </button>
      </div>
    </div>
  )
}

function Vetos({
  delegadoId,
  clubes,
  lista,
  aoMudar
}: {
  delegadoId: number
  clubes: Clube[]
  lista: VetoClube[]
  aoMudar: (l: VetoClube[]) => void
}): JSX.Element {
  const [clubeId, setClubeId] = useState<number | ''>('')
  const [motivo, setMotivo] = useState('')

  async function adicionar(): Promise<void> {
    if (clubeId === '') return
    const lista = await guardarCom(
      () => window.api.delegados.criarVeto({ delegadoId, clubeId, motivo: motivo || null }),
      'Veto guardado.'
    )
    if (!lista) return
    aoMudar(lista)
    setClubeId('')
    setMotivo('')
  }

  return (
    <div className="cartao">
      <h2>Clubes vetados</h2>
      <table className="tabela">
        <tbody>
          {lista.map((v) => (
            <tr key={v.id}>
              <td>{v.clubeNome}</td>
              <td className="silencioso">{v.motivo ?? '—'}</td>
              <td style={{ width: 1 }}>
                <button
                  className="botao pequeno perigo"
                  onClick={async () => {
                    const lista = await guardarCom(
                      () => window.api.delegados.apagarVeto(v.id, delegadoId),
                      'Veto removido.'
                    )
                    if (lista) aoMudar(lista)
                  }}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
          {lista.length === 0 && (
            <tr>
              <td colSpan={3} className="silencioso">
                Sem restrições de clube.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="linha-campos" style={{ marginTop: 10 }}>
        <label className="campo" style={{ flex: '2 1 200px' }}>
          Clube
          <select value={clubeId} onChange={(e) => setClubeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Escolher…</option>
            {clubes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Motivo
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <button className="botao" style={{ flex: '0 0 auto' }} onClick={adicionar}>
          Adicionar
        </button>
      </div>
    </div>
  )
}
