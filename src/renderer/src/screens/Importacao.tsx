import { useEffect, useMemo, useState } from 'react'
import type { CatalogoFpf } from '@shared/api'
import type {
  DiffJogo,
  ProgressoSincronizacao,
  ResultadoSincronizacao
} from '@shared/tipos'
import JogoManual from '../components/JogoManual'
import { classes, formatarDataHora, paraDataIso } from '../lib/formato'

export default function Importacao(): JSX.Element {
  const [catalogo, setCatalogo] = useState<CatalogoFpf | null>(null)
  const [seasonId, setSeasonId] = useState<number | null>(null)
  const [organizacao, setOrganizacao] = useState<string>('Competições FPF')
  const [escolhidas, setEscolhidas] = useState<Set<number>>(new Set())
  const [desde, setDesde] = useState<string>(() => paraDataIso(new Date()))
  const [usarDesde, setUsarDesde] = useState(true)

  const [aCarregar, setACarregar] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoSincronizacao | null>(null)
  const [resultado, setResultado] = useState<ResultadoSincronizacao | null>(null)
  const [selecaoDiff, setSelecaoDiff] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [aplicado, setAplicado] = useState<string | null>(null)

  useEffect(() => {
    return window.api.fpf.aoProgredir(setProgresso)
  }, [])

  async function carregarCatalogo(epoca?: number): Promise<void> {
    setACarregar(true)
    setErro(null)
    try {
      const c = await window.api.fpf.catalogo(epoca)
      setCatalogo(c)
      const atual = epoca ?? c.epocas.find((e) => e.selecionada)?.seasonId ?? c.epocas[0]?.seasonId ?? null
      setSeasonId(atual)
      if (!c.organizacoes.some((o) => o.nome === organizacao)) {
        setOrganizacao(c.organizacoes[0]?.nome ?? '')
      }
      if (atual != null) {
        const guardadas = (await window.api.competicoes.listar(atual))
          .filter((x) => x.ativa && x.fpfCompetitionId != null)
          .map((x) => x.fpfCompetitionId!)
        setEscolhidas(new Set(guardadas))
      }
    } catch (e) {
      setErro(
        `Não foi possível contactar o Centro de Resultados da FPF: ${(e as Error).message}. ` +
          'Verifique a ligação à internet e tente novamente.'
      )
    } finally {
      setACarregar(false)
    }
  }

  useEffect(() => {
    void carregarCatalogo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const competicoes = useMemo(
    () => catalogo?.organizacoes.find((o) => o.nome === organizacao)?.competicoes ?? [],
    [catalogo, organizacao]
  )

  function alternar(id: number): void {
    const nova = new Set(escolhidas)
    if (nova.has(id)) nova.delete(id)
    else nova.add(id)
    setEscolhidas(nova)
  }

  async function sincronizar(): Promise<void> {
    if (seasonId == null || escolhidas.size === 0) return
    setACarregar(true)
    setErro(null)
    setResultado(null)
    setAplicado(null)
    try {
      const descricao = catalogo?.epocas.find((e) => e.seasonId === seasonId)?.descricao ?? ''
      const r = await window.api.fpf.sincronizar({
        seasonId,
        descricaoEpoca: descricao,
        organizacao,
        desde: usarDesde ? desde : undefined,
        competicoes: competicoes
          .filter((c) => escolhidas.has(c.competitionId))
          .map((c) => ({
            competitionId: c.competitionId,
            nome: c.nome,
            nivelMinimo: null,
            usaDelegadoCampo: true
          }))
      })
      setResultado(r)
      // Por omissão aplicam-se os jogos novos e os alterados; os inalterados não precisam.
      setSelecaoDiff(new Set(r.diffs.filter((d) => d.tipo !== 'INALTERADO').map((d) => d.chaveNatural)))
    } catch (e) {
      setErro(`A sincronização falhou: ${(e as Error).message}`)
    } finally {
      setACarregar(false)
      setProgresso(null)
    }
  }

  async function aplicar(): Promise<void> {
    const r = await window.api.fpf.aplicar([...selecaoDiff])
    setAplicado(`${r.aplicados} jogos gravados.`)
    setResultado(null)
  }

  const diffs = resultado?.diffs ?? []
  const novos = diffs.filter((d) => d.tipo === 'NOVO')
  const alterados = diffs.filter((d) => d.tipo === 'ALTERADO')
  const criticos = alterados.filter((d) => d.temNomeacoes)

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Importação de jogos</h1>
        <div className="subtitulo">Centro de Resultados da FPF · resultados.fpf.pt</div>
        <div className="espacador" />
        <button className="botao" onClick={() => carregarCatalogo(seasonId ?? undefined)} disabled={aCarregar}>
          Recarregar catálogo
        </button>
      </div>

      <div className="corpo-ecra">
        {erro && <div className="aviso-caixa erro">{erro}</div>}
        {aplicado && <div className="aviso-caixa info">{aplicado}</div>}

        <div className="cartao">
          <h2>1. Escolher época e competições</h2>
          <div className="linha-campos" style={{ marginBottom: 12 }}>
            <label className="campo">
              Época
              <select
                value={seasonId ?? ''}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setSeasonId(v)
                  void carregarCatalogo(v)
                }}
              >
                {catalogo?.epocas.map((e) => (
                  <option key={e.seasonId} value={e.seasonId}>
                    {e.descricao}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              Organização
              <select value={organizacao} onChange={(e) => setOrganizacao(e.target.value)}>
                {catalogo?.organizacoes.map((o) => (
                  <option key={o.nome} value={o.nome}>
                    {o.nome} ({o.competicoes.length})
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              Importar a partir de
              <div className="linha">
                <input
                  type="checkbox"
                  checked={usarDesde}
                  onChange={(e) => setUsarDesde(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <input
                  type="date"
                  value={desde}
                  disabled={!usarDesde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
            </label>
          </div>

          {aCarregar && !progresso && <div className="vazio">A carregar competições…</div>}

          {competicoes.length > 0 && (
            <>
              <div className="linha" style={{ marginBottom: 8 }}>
                <button
                  className="botao pequeno"
                  onClick={() => setEscolhidas(new Set(competicoes.map((c) => c.competitionId)))}
                >
                  Selecionar todas
                </button>
                <button className="botao pequeno" onClick={() => setEscolhidas(new Set())}>
                  Limpar
                </button>
                <span className="silencioso">{escolhidas.size} selecionadas</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 4,
                  maxHeight: 280,
                  overflow: 'auto'
                }}
              >
                {competicoes.map((c) => (
                  <label
                    key={c.competitionId}
                    className="linha"
                    style={{ padding: '4px 6px', borderRadius: 4, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={escolhidas.has(c.competitionId)}
                      onChange={() => alternar(c.competitionId)}
                    />
                    <span>
                      {c.nome}
                      {c.modalidade && <span className="silencioso"> · {c.modalidade}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="linha" style={{ marginTop: 14 }}>
            <button
              className="botao primario"
              onClick={sincronizar}
              disabled={aCarregar || escolhidas.size === 0}
            >
              {aCarregar ? 'A sincronizar…' : 'Sincronizar jogos'}
            </button>
            <span className="silencioso">
              Uma competição grande pode ter mais de 100 jornadas; os pedidos são feitos um a um, com pausa,
              para não sobrecarregar o site da FPF.
            </span>
          </div>

          {progresso && (
            <div style={{ marginTop: 12 }}>
              <div className="barra-progresso">
                <i style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%` }} />
              </div>
              <div className="silencioso" style={{ marginTop: 4 }}>
                {progresso.etapa} ({progresso.atual}/{progresso.total})
              </div>
            </div>
          )}
        </div>

        {resultado && (
          <div className="cartao">
            <h2>2. Rever alterações</h2>

            {resultado.erros.length > 0 && (
              <div className="aviso-caixa erro">
                {resultado.erros.length} erros durante a leitura:
                <ul style={{ margin: '6px 0 0 16px' }}>
                  {resultado.erros.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {criticos.length > 0 && (
              <div className="aviso-caixa alerta">
                <b>{criticos.length} jogos com delegado já nomeado mudaram de data, hora ou recinto.</b> Reveja
                cada um antes de aplicar — pode ser preciso avisar o delegado.
              </div>
            )}

            <div className="linha" style={{ marginBottom: 10 }}>
              <span className="emblema ok">{novos.length} novos</span>
              <span className="emblema alerta">{alterados.length} alterados</span>
              <span className="emblema neutro">{diffs.length - novos.length - alterados.length} sem alteração</span>
              {resultado.clubesNovos.length > 0 && (
                <span className="emblema neutro">{resultado.clubesNovos.length} clubes novos</span>
              )}
            </div>

            {resultado.clubesNovos.length > 0 && (
              <div className="silencioso" style={{ marginBottom: 10 }}>
                Clubes que vão ser criados: {resultado.clubesNovos.join(', ')}
              </div>
            )}

            <div className="envolve-tabela" style={{ maxHeight: 420 }}>
              <TabelaDiffs
                diffs={diffs.filter((d) => d.tipo !== 'INALTERADO')}
                selecao={selecaoDiff}
                aoAlternar={(chave) => {
                  const nova = new Set(selecaoDiff)
                  if (nova.has(chave)) nova.delete(chave)
                  else nova.add(chave)
                  setSelecaoDiff(nova)
                }}
              />
            </div>

            <div className="linha" style={{ marginTop: 12 }}>
              <button className="botao primario" onClick={aplicar} disabled={selecaoDiff.size === 0}>
                Aplicar {selecaoDiff.size} alterações
              </button>
              <button className="botao" onClick={() => setResultado(null)}>
                Descartar
              </button>
            </div>
          </div>
        )}

        <JogoManual />
      </div>
    </>
  )
}

function TabelaDiffs({
  diffs,
  selecao,
  aoAlternar
}: {
  diffs: DiffJogo[]
  selecao: Set<string>
  aoAlternar: (chave: string) => void
}): JSX.Element {
  if (diffs.length === 0) {
    return <div className="vazio">Nada para atualizar — os jogos já estão todos em dia.</div>
  }
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th style={{ width: 1 }} />
          <th style={{ width: 1 }}>Tipo</th>
          <th>Jogo</th>
          <th>Data</th>
          <th>Recinto</th>
          <th>Alterações</th>
        </tr>
      </thead>
      <tbody>
        {diffs.map((d) => (
          <tr key={d.chaveNatural} className={classes(d.temNomeacoes && 'critico')}>
            <td>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={selecao.has(d.chaveNatural)}
                onChange={() => aoAlternar(d.chaveNatural)}
              />
            </td>
            <td>
              <span className={classes('emblema', d.tipo === 'NOVO' ? 'ok' : 'alerta')}>
                {d.tipo === 'NOVO' ? 'Novo' : 'Alterado'}
              </span>
            </td>
            <td>
              {d.clubeCasa} × {d.clubeFora}
              <div className="silencioso">
                {d.competicaoNome}
                {d.jornada && ` · jornada ${d.jornada}`}
              </div>
            </td>
            <td>{formatarDataHora(d.dataHora)}</td>
            <td className="silencioso">{d.recinto ?? '—'}</td>
            <td>
              {d.temNomeacoes && <span className="emblema erro">Já tem delegado</span>}
              {d.alteracoes.map((a, i) => (
                <div key={i} className="silencioso">
                  {a.campo}: {a.antes ?? '—'} → <b>{a.depois ?? '—'}</b>
                </div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
