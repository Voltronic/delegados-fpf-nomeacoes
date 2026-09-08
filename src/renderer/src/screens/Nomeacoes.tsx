import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Candidato,
  Competicao,
  JogoDetalhado,
  PapelNomeacao,
  ResultadoPropostaAutomatica
} from '@shared/tipos'
import CartaoCandidato from '../components/CartaoCandidato'
import Mapa, { type PontoMapa } from '../components/Mapa'
import { classes, formatarDataHora, formatarKm, inicioDaSemana, paraDataIso } from '../lib/formato'

type EstadoNomeacao = 'TODOS' | 'POR_NOMEAR' | 'PARCIAL' | 'COMPLETO'

interface Props {
  tilesUrl: string
  /** Incrementa quando uma atualização automática termina. */
  versaoDados: number
}

export default function Nomeacoes({ tilesUrl, versaoDados }: Props): JSX.Element {
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()))
  const [competicaoId, setCompeticaoId] = useState<number | ''>('')
  const [estado, setEstado] = useState<EstadoNomeacao>('TODOS')
  const [texto, setTexto] = useState('')

  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [jogos, setJogos] = useState<JogoDetalhado[]>([])
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [realcado, setRealcado] = useState<number | null>(null)
  const [aCarregarCandidatos, setACarregarCandidatos] = useState(false)
  const [proposta, setProposta] = useState<ResultadoPropostaAutomatica | null>(null)
  const [aPropor, setAPropor] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const fim = useMemo(() => {
    const d = new Date(semana)
    d.setDate(d.getDate() + 7)
    return d
  }, [semana])

  useEffect(() => {
    void window.api.competicoes.listar().then(setCompeticoes)
  }, [versaoDados])

  const carregarJogos = useCallback(async () => {
    const lista = await window.api.jogos.listar({
      de: paraDataIso(semana),
      ate: `${paraDataIso(fim)}T23:59`,
      competicaoId: competicaoId === '' ? undefined : competicaoId,
      estadoNomeacao: estado,
      texto: texto.trim() || undefined
    })
    setJogos(lista)
    setSelecionado((atual) => (atual && lista.some((j) => j.id === atual) ? atual : (lista[0]?.id ?? null)))
  }, [semana, fim, competicaoId, estado, texto])

  useEffect(() => {
    void carregarJogos()
  }, [carregarJogos, versaoDados])

  const jogo = jogos.find((j) => j.id === selecionado) ?? null
  const competicaoDoJogo = competicoes.find((c) => c.id === jogo?.competicaoId)
  const usaDelegadoCampo = competicaoDoJogo?.usaDelegadoCampo ?? true

  const carregarCandidatos = useCallback(async (jogoId: number) => {
    setACarregarCandidatos(true)
    try {
      setCandidatos(await window.api.nomeacoes.candidatos(jogoId, 'PRINCIPAL'))
    } finally {
      setACarregarCandidatos(false)
    }
  }, [])

  useEffect(() => {
    if (selecionado == null) {
      setCandidatos([])
      return
    }
    void carregarCandidatos(selecionado)
  }, [selecionado, carregarCandidatos])

  async function nomear(delegadoId: number, papel: PapelNomeacao): Promise<void> {
    if (selecionado == null) return
    try {
      await window.api.nomeacoes.nomear({ jogoId: selecionado, delegadoId, papel })
      setErro(null)
    } catch (e) {
      // As mensagens do processo principal vêm prefixadas pelo canal IPC.
      setErro((e as Error).message.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, ''))
      return
    }
    await carregarJogos()
    await carregarCandidatos(selecionado)
  }

  async function remover(papel: PapelNomeacao): Promise<void> {
    if (selecionado == null) return
    await window.api.nomeacoes.remover(selecionado, papel)
    await carregarJogos()
    await carregarCandidatos(selecionado)
  }

  async function gerarProposta(): Promise<void> {
    setAPropor(true)
    try {
      setProposta(await window.api.nomeacoes.proposta(jogos.map((j) => j.id)))
      setErro(null)
    } catch (e) {
      setErro(`Não foi possível calcular a proposta: ${(e as Error).message}`)
    } finally {
      setAPropor(false)
    }
  }

  async function aplicarProposta(): Promise<void> {
    if (!proposta) return
    await window.api.nomeacoes.aplicarProposta(proposta.propostas)
    setProposta(null)
    await carregarJogos()
    if (selecionado != null) await carregarCandidatos(selecionado)
  }

  const elegiveis = candidatos.filter((c) => c.elegivel)
  const bloqueados = candidatos.filter((c) => !c.elegivel)
  const kmMaximo = Math.max(1, ...candidatos.map((c) => c.kmEpoca))

  const pontos: PontoMapa[] = candidatos
    .filter((c): c is Candidato & { lat: number; lng: number } => c.lat != null && c.lng != null)
    .map((c) => {
      const posicao = elegiveis.indexOf(c) + 1
      return {
        id: c.delegadoId,
        lat: c.lat,
        lng: c.lng,
        etiqueta: c.elegivel ? String(posicao) : '×',
        titulo: `${posicao > 0 ? `${posicao}. ` : ''}${c.nome} — ${formatarKm(c.kmViagem)} ida e volta`,
        classe: !c.elegivel ? 'bloqueado' : posicao <= 3 ? 'top' : posicao <= 10 ? 'medio' : 'baixo'
      }
    })

  const nomeados = jogos.filter((j) => j.nomeacoes.length > 0).length

  return (
    <>
      <div className="cabecalho-ecra">
        <div className="linha">
          <button
            className="botao pequeno"
            onClick={() => setSemana((s) => new Date(s.getTime() - 7 * 86400000))}
          >
            ‹
          </button>
          <button className="botao pequeno" onClick={() => setSemana(inicioDaSemana(new Date()))}>
            Semana atual
          </button>
          <button
            className="botao pequeno"
            onClick={() => setSemana((s) => new Date(s.getTime() + 7 * 86400000))}
          >
            ›
          </button>
        </div>
        <div>
          <h1>
            {semana.toLocaleDateString('pt-PT')} — {new Date(fim.getTime() - 86400000).toLocaleDateString('pt-PT')}
          </h1>
          <div className="subtitulo">
            {jogos.length} jogos · {nomeados} com delegado
          </div>
        </div>

        <div style={{ width: 220 }}>
          <select value={competicaoId} onChange={(e) => setCompeticaoId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas as competições</option>
            {competicoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="grupo-botoes">
          {(['TODOS', 'POR_NOMEAR', 'PARCIAL', 'COMPLETO'] as EstadoNomeacao[]).map((e) => (
            <button key={e} className={classes(estado === e && 'ativo')} onClick={() => setEstado(e)}>
              {{ TODOS: 'Todos', POR_NOMEAR: 'Por nomear', PARCIAL: 'Parcial', COMPLETO: 'Completo' }[e]}
            </button>
          ))}
        </div>

        <div style={{ width: 180 }}>
          <input
            type="search"
            placeholder="Clube ou recinto…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>

        <div className="espacador" />
        <button className="botao primario" onClick={gerarProposta} disabled={aPropor || jogos.length === 0}>
          {aPropor ? 'A calcular…' : 'Proposta automática'}
        </button>
      </div>

      <div className="corpo-ecra sem-padding">
        <div className="tres-paineis">
          {/* ------------------------------------------------ jogos */}
          <div className="painel">
            <div className="painel-cabecalho">
              <h2>Jogos da semana</h2>
            </div>
            <div className="painel-corpo">
              {jogos.length === 0 && (
                <div className="vazio">
                  Sem jogos nesta semana com os filtros atuais.
                  <br />
                  Importe competições no ecrã <b>Importação</b>.
                </div>
              )}
              {jogos.map((j) => (
                <div
                  key={j.id}
                  className={classes('item-jogo', j.id === selecionado && 'selecionado')}
                  onClick={() => setSelecionado(j.id)}
                >
                  <div className="topo">
                    <span>{formatarDataHora(j.dataHora)}</span>
                    <span>·</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.competicaoNome}
                    </span>
                  </div>
                  <div className="equipas">
                    {j.clubeCasaNome} <span className="silencioso">×</span> {j.clubeForaNome}
                  </div>
                  <div className="local">{j.recintoNome ?? 'recinto por indicar'}</div>
                  {j.nomeacoes.length > 0 && (
                    <div className="chips">
                      {j.nomeacoes.map((n) => (
                        <span
                          key={n.id}
                          className={classes('chip-delegado', n.papel === 'CAMPO' && 'campo')}
                          title={n.papel === 'PRINCIPAL' ? 'Delegado principal' : 'Delegado de campo'}
                        >
                          {n.papel === 'PRINCIPAL' ? 'P' : 'C'} {n.delegadoNome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* -------------------------------------------- candidatos */}
          <div className="painel">
            <div className="painel-cabecalho">
              {jogo ? (
                <>
                  <h2>Candidatos</h2>
                  <div style={{ marginTop: 4 }}>
                    <b>
                      {jogo.clubeCasaNome} × {jogo.clubeForaNome}
                    </b>
                    <div className="silencioso">
                      {formatarDataHora(jogo.dataHora)} · {jogo.recintoNome ?? 'recinto por indicar'}
                      {jogo.jornada && ` · jornada ${jogo.jornada}`}
                    </div>
                  </div>
                </>
              ) : (
                <h2>Candidatos</h2>
              )}
            </div>

            <div className="painel-corpo" style={{ padding: 12 }}>
              {!jogo && <div className="vazio">Selecione um jogo à esquerda.</div>}

              {erro && <div className="aviso-caixa erro">{erro}</div>}

              {jogo && jogo.recintoId == null && (
                <div className="aviso-caixa alerta">
                  A FPF ainda não indicou o recinto deste jogo, por isso não há distâncias nem ordenação
                  por proximidade. Aparecerá numa atualização seguinte, quando o local for anunciado.
                </div>
              )}

              {jogo && jogo.nomeacoes.length > 0 && (
                <div className="cartao" style={{ padding: 10, marginBottom: 12 }}>
                  <div className="pilha">
                    {jogo.nomeacoes.map((n) => (
                      <div className="linha" key={n.id}>
                        <span className="emblema ok">
                          {n.papel === 'PRINCIPAL' ? 'Principal' : 'Campo'}
                        </span>
                        <b>
                          {n.delegadoNumero} — {n.delegadoNome}
                        </b>
                        <span className="silencioso">{formatarKm(n.km)}</span>
                        <div className="espacador" style={{ marginLeft: 'auto' }} />
                        <button className="botao pequeno perigo" onClick={() => remover(n.papel)}>
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aCarregarCandidatos && <div className="vazio">A calcular distâncias e prioridades…</div>}

              {!aCarregarCandidatos &&
                jogo &&
                elegiveis.map((c, i) => (
                  <CartaoCandidato
                    key={c.delegadoId}
                    candidato={c}
                    posicao={i + 1}
                    realcado={realcado === c.delegadoId}
                    kmMaximo={kmMaximo}
                    usaDelegadoCampo={usaDelegadoCampo}
                    papelAtribuido={jogo.nomeacoes.find((n) => n.delegadoId === c.delegadoId)?.papel ?? null}
                    aoNomear={nomear}
                    aoRealcar={setRealcado}
                  />
                ))}

              {!aCarregarCandidatos && jogo && elegiveis.length === 0 && (
                <div className="vazio">
                  Nenhum delegado elegível para este jogo.
                  <br />
                  Verifique indisponibilidades, vetos e o nível exigido pela competição.
                </div>
              )}

              {bloqueados.length > 0 && (
                <details className="grupo-bloqueados">
                  <summary>Não elegíveis ({bloqueados.length})</summary>
                  {bloqueados.map((c) => (
                    <CartaoCandidato
                      key={c.delegadoId}
                      candidato={c}
                      posicao={0}
                      realcado={realcado === c.delegadoId}
                      kmMaximo={kmMaximo}
                      usaDelegadoCampo={usaDelegadoCampo}
                      papelAtribuido={jogo?.nomeacoes.find((n) => n.delegadoId === c.delegadoId)?.papel ?? null}
                      aoNomear={nomear}
                      aoRealcar={setRealcado}
                    />
                  ))}
                </details>
              )}
            </div>
          </div>

          {/* -------------------------------------------------- mapa */}
          <div className="painel">
            <div className="painel-cabecalho">
              <h2>Mapa</h2>
              <div className="silencioso" style={{ marginTop: 3 }}>
                {jogo?.recintoNome ?? 'sem recinto'} · {pontos.length} delegados localizados
              </div>
            </div>
            <div className="painel-corpo" style={{ display: 'flex', flexDirection: 'column' }}>
              <Mapa
                tilesUrl={tilesUrl}
                recinto={
                  jogo?.recintoLat != null && jogo.recintoLng != null
                    ? { lat: jogo.recintoLat, lng: jogo.recintoLng, titulo: jogo.recintoNome ?? 'Recinto' }
                    : null
                }
                pontos={pontos}
                realcado={realcado}
                aoSelecionar={(id) => setRealcado(id)}
                aoRealcar={setRealcado}
              />
            </div>
          </div>
        </div>
      </div>

      {proposta && (
        <RevisaoProposta
          proposta={proposta}
          aoFechar={() => setProposta(null)}
          aoAplicar={aplicarProposta}
          aoRemover={(jogoId) =>
            setProposta({ ...proposta, propostas: proposta.propostas.filter((p) => p.jogoId !== jogoId) })
          }
        />
      )}
    </>
  )
}

function RevisaoProposta({
  proposta,
  aoFechar,
  aoAplicar,
  aoRemover
}: {
  proposta: ResultadoPropostaAutomatica
  aoFechar: () => void
  aoAplicar: () => void
  aoRemover: (jogoId: number) => void
}): JSX.Element {
  const { propostas, semSugestao, jaCompletos } = proposta
  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Proposta automática</h2>
          <span className="silencioso">
            {propostas.length} jogos com sugestão · nada é gravado até confirmar
          </span>
        </header>
        <div className="modal-corpo">
          {(semSugestao.length > 0 || jaCompletos > 0) && (
            <div className="aviso-caixa alerta">
              <b>Porque não são todos os jogos da semana:</b>
              <ul style={{ margin: '6px 0 0 16px' }}>
                {jaCompletos > 0 && <li>{jaCompletos} já tinham os delegados todos nomeados.</li>}
                {semSugestao.length > 0 && (
                  <li>
                    {semSugestao.length} não tinham ninguém elegível. Com poucos delegados e vários jogos
                    à mesma hora, os candidatos esgotam-se — cada nomeação bloqueia esse delegado para os
                    outros jogos do mesmo horário.
                  </li>
                )}
              </ul>
            </div>
          )}

          {propostas.length === 0 ? (
            <div className="vazio">
              Não há sugestões a fazer: ou os jogos já estão nomeados, ou nenhum delegado é elegível.
            </div>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Jogo</th>
                  <th>Data</th>
                  <th>Principal</th>
                  <th>Campo</th>
                  <th>Porquê</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {propostas.map((p) => (
                  <tr key={p.jogoId}>
                    <td>{p.descricaoJogo}</td>
                    <td>{formatarDataHora(p.dataHora)}</td>
                    <td>
                      {p.principal ? (
                        <>
                          {p.principal.nome}
                          <div className="silencioso">{formatarKm(p.principal.km)}</div>
                        </>
                      ) : (
                        <span className="silencioso">—</span>
                      )}
                    </td>
                    <td>
                      {p.campo ? (
                        <>
                          {p.campo.nome}
                          <div className="silencioso">{formatarKm(p.campo.km)}</div>
                        </>
                      ) : (
                        <span className="silencioso">—</span>
                      )}
                    </td>
                    <td className="silencioso">{p.motivo}</td>
                    <td>
                      <button className="botao pequeno perigo" onClick={() => aoRemover(p.jogoId)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {semSugestao.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="silencioso" style={{ cursor: 'pointer' }}>
                Ver os {semSugestao.length} jogos sem sugestão e porquê
              </summary>
              <table className="tabela" style={{ marginTop: 8 }}>
                <tbody>
                  {semSugestao.map((s) => (
                    <tr key={s.jogoId}>
                      <td>{s.descricaoJogo}</td>
                      <td>{formatarDataHora(s.dataHora)}</td>
                      <td className="silencioso">{s.motivos.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
        <footer>
          <button className="botao" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="botao primario" onClick={aoAplicar} disabled={propostas.length === 0}>
            Aplicar {propostas.length} nomeações
          </button>
        </footer>
      </div>
    </div>
  )
}
