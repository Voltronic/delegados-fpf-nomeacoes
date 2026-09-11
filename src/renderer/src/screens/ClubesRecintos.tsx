import { useCallback, useEffect, useState } from 'react'
import type { RecintoDoClubeApi } from '@shared/api'
import type {
  Clube,
  Competicao,
  ProgressoGeocodificacao,
  Recinto,
  ResultadoGeocodificacaoLote
} from '@shared/tipos'
import Mapa from '../components/Mapa'
import { classes } from '../lib/formato'
import { avisar, guardarCom } from '../lib/avisos'

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
    const lista = await guardarCom(
      () =>
        window.api.clubes.definirRecinto({
          clubeId: selecionado,
          competicaoId: competicaoId === '' ? null : competicaoId,
          recintoId
        }),
      'Recinto associado ao clube.'
    )
    if (!lista) return
    setAssociacoes(lista)
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
                const lista = await guardarCom(
                  () => window.api.clubes.guardar({ nome: novoNome.trim(), notas: null }),
                  `Clube "${novoNome.trim()}" criado.`
                )
                if (!lista) return
                setClubes(lista)
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
                        const lista = await guardarCom(
                          () =>
                            window.api.clubes.guardar({
                              id: clube.id,
                              nome: e.target.value.trim(),
                              notas: clube.notas
                            }),
                          'Nome do clube guardado.'
                        )
                        if (lista) setClubes(lista)
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
                          onClick={async () => {
                            const lista = await guardarCom(
                              () => window.api.clubes.apagarRecinto(a.id, clube.id),
                              'Associação removida.'
                            )
                            if (lista) setAssociacoes(lista)
                          }}
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
  const [aLocalizarTodos, setALocalizarTodos] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoGeocodificacao | null>(null)
  const [relatorio, setRelatorio] = useState<ResultadoGeocodificacaoLote | null>(null)
  const [vista, setVista] = useState<'TODOS' | 'SEM_COORDS' | 'POR_CONFIRMAR'>('TODOS')
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
  const [procura, setProcura] = useState('')
  const [candidatos, setCandidatos] = useState<
    { lat: number; lng: number; moradaResolvida: string; categoria: string }[] | null
  >(null)
  const [aProcurar, setAProcurar] = useState(false)

  useEffect(() => {
    void window.api.recintos.listar().then(setRecintos)
    return window.api.recintos.aoProgredir((p) => setProgresso(p.concluido ? null : p))
  }, [])

  async function localizarTodos(): Promise<void> {
    setALocalizarTodos(true)
    setRelatorio(null)
    try {
      const r = await window.api.recintos.geocodificarEmFalta()
      setRelatorio(r)
      setRecintos(await window.api.recintos.listar())
      if (r.porConfirmar > 0) setVista('POR_CONFIRMAR')
    } finally {
      setALocalizarTodos(false)
      setProgresso(null)
    }
  }

  useEffect(() => {
    if (selecionado === 'novo') {
      setForm({ nome: '', morada: null, lat: null, lng: null, coordsManuais: false })
      return
    }
    const r = recintos.find((x) => x.id === selecionado)
    if (r) setForm(r)
  }, [selecionado, recintos])

  async function guardar(): Promise<void> {
    if (!form.nome.trim()) {
      avisar('O nome do recinto é obrigatório.', 'erro')
      return
    }
    const lista = await guardarCom(() => window.api.recintos.guardar(form), `${form.nome} guardado.`)
    if (!lista) return
    setRecintos(lista)
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
        avisar('Recinto localizado.')
      } else {
        avisar('Não foi encontrado. Cole o link do Google Maps ou escreva a localidade.', 'erro')
      }
    } finally {
      setAGeocodificar(false)
    }
  }

  // Totais de toda a base de dados: é o que os botões de ação usam, e esses
  // atuam sobre todos os recintos, não só sobre os que a procura mostra.
  const semCoordenadas = recintos.filter((r) => r.lat == null).length
  const porConfirmar = recintos.filter((r) => r.lat != null && !r.confirmado).length

  // As abas contam só o que a procura deixa ver. Contar tudo dizia "Por
  // confirmar (12)" ao lado de uma lista vazia, porque nenhum dos 12
  // correspondia ao que estava escrito na procura.
  const porTexto = recintos.filter((r) => r.nome.toLowerCase().includes(filtro.toLowerCase()))
  const semCoordenadasNaProcura = porTexto.filter((r) => r.lat == null).length
  const porConfirmarNaProcura = porTexto.filter((r) => r.lat != null && !r.confirmado).length

  const visiveis = porTexto
    .filter((r) => {
      if (vista === 'SEM_COORDS') return r.lat == null
      if (vista === 'POR_CONFIRMAR') return r.lat != null && !r.confirmado
      return true
    })
    // Na revisão, primeiro os menos fiáveis — é aí que estão os erros.
    .sort((a, b) => {
      if (vista !== 'POR_CONFIRMAR') return 0
      const risco = (r: Recinto): number => ({ BAIXA: 0, MEDIA: 1, ALTA: 2 })[r.confianca ?? 'BAIXA']
      return risco(a) - risco(b)
    })

  const pontosMapa = recintos
    .filter((r): r is Recinto & { lat: number; lng: number } => r.lat != null && r.lng != null)
    .map((r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      etiqueta: r.confirmado ? '✓' : '?',
      titulo: `${r.nome}${r.clubes?.length ? ` — ${r.clubes.join(', ')}` : ''}`,
      classe: (r.confirmado ? 'top' : 'medio') as 'top' | 'medio'
    }))

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
          <div className="grupo-botoes" style={{ marginTop: 8 }}>
            <button className={classes(vista === 'TODOS' && 'ativo')} onClick={() => setVista('TODOS')}>
              Todos ({porTexto.length})
            </button>
            <button
              className={classes(vista === 'SEM_COORDS' && 'ativo')}
              onClick={() => setVista('SEM_COORDS')}
            >
              Sem coords ({semCoordenadasNaProcura})
            </button>
            <button
              className={classes(vista === 'POR_CONFIRMAR' && 'ativo')}
              onClick={() => setVista('POR_CONFIRMAR')}
            >
              Por confirmar ({porConfirmarNaProcura})
            </button>
          </div>
        </div>
        <div className="painel-corpo">
          {visiveis.map((r) => (
            <div
              key={r.id}
              className={classes('item-jogo', r.id === selecionado && 'selecionado')}
              onClick={() => setSelecionado(r.id)}
            >
              <div className="equipas">{r.nome}</div>
              {r.clubes && r.clubes.length > 0 && <div className="local">{r.clubes.join(', ')}</div>}
              {r.moradaResolvida && <div className="local">{r.moradaResolvida}</div>}
              <div className="linha" style={{ flexWrap: 'wrap' }}>
                {r.lat == null && <span className="emblema alerta">Sem coordenadas</span>}
                {r.lat != null && !r.confirmado && (
                  <span
                    className={classes(
                      'emblema',
                      r.confianca === 'BAIXA' ? 'erro' : r.confianca === 'ALTA' ? 'neutro' : 'alerta'
                    )}
                    title={`Encontrado por: ${r.origemCoords ?? '?'}`}
                  >
                    {r.confianca === 'BAIXA'
                      ? 'Pouco fiável'
                      : r.confianca === 'ALTA'
                        ? 'Confirmar'
                        : 'A conferir'}
                  </span>
                )}
                {r.confirmado && <span className="emblema ok">Confirmado</span>}
              </div>
            </div>
          ))}
          {visiveis.length === 0 && (
            <div className="vazio">
              {filtro.trim() ? 'Nenhum recinto corresponde à procura nesta vista.' : 'Nada nesta vista.'}
            </div>
          )}
        </div>
        <div className="painel-cabecalho" style={{ borderTop: '1px solid var(--borda)', borderBottom: 'none' }}>
          <div className="pilha">
            <button
              className="botao primario"
              onClick={localizarTodos}
              disabled={aLocalizarTodos || semCoordenadas === 0}
            >
              {aLocalizarTodos ? 'A localizar…' : `Localizar os ${semCoordenadas} em falta`}
            </button>
            {progresso && (
              <>
                <div className="barra-progresso">
                  <i style={{ width: `${(progresso.atual / progresso.total) * 100}%` }} />
                </div>
                <div className="silencioso">
                  {progresso.atual}/{progresso.total} · {progresso.recinto}
                </div>
              </>
            )}
            <button className="botao" onClick={() => setSelecionado('novo')}>
              Novo recinto
            </button>
          </div>
        </div>
      </div>

      <div className="corpo-ecra">
        {relatorio && (
          <div className={`aviso-caixa ${relatorio.falhados.length ? 'alerta' : 'info'}`}>
            <b>{relatorio.localizados} recintos localizados</b>
            {relatorio.corrigidos > 0 && `, ${relatorio.corrigidos} por correções já confirmadas`} — {relatorio.porConfianca.alta} com
            várias pesquisas a concordar, {relatorio.porConfianca.media} razoáveis e{' '}
            {relatorio.porConfianca.baixa} pouco fiáveis.{' '}
            {relatorio.porConfirmar > 0 && (
              <>
                Estão {relatorio.porConfirmar} por confirmar; comece pelos pouco fiáveis, que aparecem
                primeiro na lista.{' '}
              </>
            )}
            {relatorio.falhados.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Não foi possível localizar {relatorio.falhados.length}:{' '}
                {relatorio.falhados.map((f) => f.nome).join(', ')}. Marque-os à mão.
              </div>
            )}
          </div>
        )}

        {porConfirmar > 0 && (
          <div className="cartao">
            <h2>Mapa de todos os recintos</h2>
            <p className="silencioso" style={{ marginTop: 0 }}>
              Um recinto no sítio errado salta à vista aqui. Verde é confirmado, azul está por confirmar.
            </p>
            <div style={{ height: 340, display: 'flex' }}>
              <Mapa
                tilesUrl={tilesUrl}
                recinto={null}
                realcado={typeof selecionado === 'number' ? selecionado : null}
                pontos={pontosMapa}
                aoSelecionar={(id) => setSelecionado(id)}
              />
            </div>
            <div className="linha" style={{ marginTop: 10 }}>
              <button
                className="botao"
                onClick={async () => {
                  const lista = await guardarCom(
                    () => window.api.recintos.confirmarTodos(),
                    `${porConfirmar} recintos confirmados.`
                  )
                  if (lista) setRecintos(lista)
                }}
              >
                Confirmar todos os {porConfirmar}
              </button>
              <span className="silencioso">
                Só faça isto depois de olhar para o mapa — os quilómetros todos dependem destes pontos.
              </span>
            </div>
          </div>
        )}

        {selecionado == null ? (
          <div className="vazio">Selecione um recinto.</div>
        ) : (
          <div className="cartao">
            <h2>{form.nome || 'Novo recinto'}</h2>
            {mensagem && <div className="aviso-caixa alerta">{mensagem}</div>}
            {typeof selecionado === 'number' &&
              (() => {
                const r = recintos.find((x) => x.id === selecionado)
                if (!r?.moradaResolvida) return null
                return (
                  <div className="pilha" style={{ marginBottom: 10 }}>
                    <div className="silencioso">
                      Encontrado como: <b>{r.moradaResolvida}</b>
                      {r.confianca ? ` · confiança ${r.confianca.toLowerCase()}` : ''}
                      {r.clubes?.length ? ` · joga aqui: ${r.clubes.join(', ')}` : ''}
                    </div>
                    <div className="linha">
                      <button
                        className={classes('botao', !r.confirmado && 'primario')}
                        onClick={async () =>
                          {
                          const lista = await guardarCom(
                            () => window.api.recintos.confirmar(r.id, !r.confirmado),
                            r.confirmado ? 'Marcado por confirmar.' : 'Ponto confirmado.'
                          )
                          if (lista) setRecintos(lista)
                        }
                        }
                      >
                        {r.confirmado ? 'Marcar por confirmar' : 'Confirmar este ponto'}
                      </button>
                    </div>
                  </div>
                )
              })()}
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
              <div className="pilha" style={{ borderTop: '1px solid var(--borda)', paddingTop: 10 }}>
                <div className="silencioso">
                  Se souber onde é, cole aqui o link do Google Maps — ou escreva a localidade e escolha
                  o resultado.
                </div>
                <div className="linha">
                  <input
                    type="search"
                    placeholder="link do Google Maps, ou Campo da Mata, Caldas da Rainha"
                    value={procura}
                    onChange={(e) => setProcura(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key !== 'Enter' || !procura.trim()) return
                      setAProcurar(true)
                      try {
                        setCandidatos(await window.api.recintos.procurar(procura))
                      } finally {
                        setAProcurar(false)
                      }
                    }}
                  />
                  <button
                    className="botao"
                    disabled={aProcurar || !procura.trim()}
                    onClick={async () => {
                      setAProcurar(true)
                      try {
                        setCandidatos(await window.api.recintos.procurar(procura))
                      } finally {
                        setAProcurar(false)
                      }
                    }}
                  >
                    {aProcurar ? 'A procurar…' : 'Procurar'}
                  </button>
                </div>
                {candidatos?.length === 0 && (
                  <div className="silencioso">Nada encontrado. Tente a localidade em vez do nome.</div>
                )}
                {candidatos?.map((cand, i) => (
                  <div key={i} className="linha">
                    <span style={{ flex: '1 1 auto' }}>
                      {cand.moradaResolvida} <span className="silencioso">({cand.categoria})</span>
                    </span>
                    <button
                      className="botao pequeno primario"
                      onClick={async () => {
                        if (typeof selecionado !== 'number') return
                        const lista = await guardarCom(
                          () =>
                            window.api.recintos.definirCoordenadas(
                              selecionado,
                              cand.lat,
                              cand.lng,
                              cand.moradaResolvida
                            ),
                          'Localização guardada e confirmada.'
                        )
                        if (!lista) return
                        setRecintos(lista)
                        setForm({ ...form, lat: cand.lat, lng: cand.lng, coordsManuais: true })
                        setCandidatos(null)
                        setProcura('')
                      }}
                    >
                      Usar este
                    </button>
                  </div>
                ))}
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
