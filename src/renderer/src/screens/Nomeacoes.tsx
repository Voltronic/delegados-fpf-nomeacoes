import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  GrupoDelegados,
  Candidato,
  Competicao,
  JogoDetalhado,
  NivelDelegado,
  PapelNomeacao,
  ResultadoPropostaAutomatica
} from '@shared/tipos'
import { classeDoPapel, etiquetaDoPapel, letraDoPapel, MAX_SOMBRAS, sombras, temPrincipal } from '@shared/tipos'
import CartaoCandidato from '../components/CartaoCandidato'
import ConfigurarProposta from '../components/ConfigurarProposta'
import EscolherOutrosJogos from '../components/EscolherOutrosJogos'
import EditarJogo from '../components/EditarJogo'
import FaixaUrgentes from '../components/FaixaUrgentes'
import Mapa, { type PontoMapa, type TrajetoMapa } from '../components/Mapa'
import { classes, formatarData, formatarDataHora, formatarKm, inicioDaSemana, paraDataIso } from '../lib/formato'
import { limiteDeTrabalho, paraDataLocal } from '@shared/datas'
import { avisar, mensagemDeErro } from '../lib/avisos'

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
  const [nivel, setNivel] = useState<'TODOS' | NivelDelegado>('TODOS')
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

  // Início do dia de hoje, para navegar por semanas.
  const hoje = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const fim = useMemo(() => {
    const d = new Date(semana)
    d.setDate(d.getDate() + 7)
    return d
  }, [semana])

  useEffect(() => {
    void window.api.competicoes.listar().then(setCompeticoes)
  }, [versaoDados])

  const [urgentes, setUrgentes] = useState<JogoDetalhado[]>([])
  const [aEditar, setAEditar] = useState<JogoDetalhado | null>(null)
  const [aConfigurarProposta, setAConfigurarProposta] = useState(false)
  const [mapaDestacado, setMapaDestacado] = useState(false)
  const [outros, setOutros] = useState<JogoDetalhado[]>([])
  const [escolherOutros, setEscolherOutros] = useState(false)
  const [trajetos, setTrajetos] = useState<TrajetoMapa[]>([])

  /**
   * Jogos que estão a chegar e ainda não têm ninguém: é a lista que não pode
   * passar despercebida. Vai à base de dados à parte da semana escolhida, senão
   * desapareciam ao navegar para outra semana — que é precisamente quando é
   * mais fácil esquecê-los.
   */
  const carregarUrgentes = useCallback(async () => {
    const daqui = new Date(hoje)
    daqui.setDate(daqui.getDate() + 7)
    setUrgentes(
      await window.api.jogos.listar({
        de: limiteDeTrabalho(),
        ate: `${paraDataIso(daqui)}T23:59`,
        estadoNomeacao: 'POR_NOMEAR'
      })
    )
  }, [hoje])

  /**
   * Os jogos das competições em que só alguns levam delegado — Taça, por
   * exemplo. Ficam fora da lista de trabalho até o coordenador os escolher,
   * senão a lista enchia-se de jogos que não são para nomear.
   *
   * Só a semana conta: a competição e a procura escolhem-se dentro do popup.
   */
  const carregarOutros = useCallback(async () => {
    const limite = limiteDeTrabalho()
    const inicioIso = paraDataIso(semana)
    setOutros(
      await window.api.jogos.listar({
        levaDelegado: 'SEM',
        de: inicioIso > limite ? inicioIso : limite,
        ate: `${paraDataIso(fim)}T23:59`
      })
    )
  }, [semana, fim])

  const carregarJogos = useCallback(async () => {
    // Um jogo deixa de ser trabalho quatro horas depois da hora de início; a
    // partir daí é histórico. A semana nunca começa antes dessa fronteira.
    const limite = limiteDeTrabalho()
    const inicioDaSemanaIso = paraDataIso(semana)
    const lista = await window.api.jogos.listar({
      de: inicioDaSemanaIso > limite ? inicioDaSemanaIso : limite,
      ate: `${paraDataIso(fim)}T23:59`,
      competicaoId: competicaoId === '' ? undefined : competicaoId,
      estadoNomeacao: estado,
      texto: texto.trim() || undefined
    })
    setJogos(lista)
    setSelecionado((atual) => (atual && lista.some((j) => j.id === atual) ? atual : (lista[0]?.id ?? null)))
  }, [semana, hoje, fim, competicaoId, estado, texto])

  useEffect(() => {
    void carregarJogos()
    void carregarUrgentes()
    void carregarOutros()
  }, [carregarJogos, carregarUrgentes, carregarOutros, versaoDados])

  const jogo = jogos.find((j) => j.id === selecionado) ?? null
  const competicaoDoJogo = competicoes.find((c) => c.id === jogo?.competicaoId)
  const usaDelegadoAssistente = competicaoDoJogo?.usaDelegadoAssistente ?? true

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

  /**
   * Desfaz a última nomeação ou remoção. Fica no próprio aviso, que é onde a
   * pessoa está a olhar quando percebe que se enganou.
   */
  async function desfazer(): Promise<void> {
    try {
      const jogo = await window.api.nomeacoes.desfazer()
      await carregarJogos()
      await carregarUrgentes()
      if (jogo) {
        setSelecionado(jogo.id)
        await carregarCandidatos(jogo.id)
      }
      avisar('Alteração anulada.')
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
    }
  }

  const anular = { etiqueta: 'Anular', executar: desfazer }

  async function nomear(delegadoId: number, papel: PapelNomeacao): Promise<void> {
    if (selecionado == null) return
    try {
      const nome = candidatos.find((c) => c.delegadoId === delegadoId)?.nome ?? 'Delegado'
      await window.api.nomeacoes.nomear({ jogoId: selecionado, delegadoId, papel })
      setErro(null)
      avisar(
        `${nome} nomeado como ${etiquetaDoPapel(papel).toLowerCase()}.`,
        'sucesso',
        anular
      )
    } catch (e) {
      const texto = mensagemDeErro(e)
      setErro(texto)
      avisar(texto, 'erro')
      return
    }
    await carregarJogos()
    await carregarUrgentes()
    await carregarCandidatos(selecionado)
  }

  async function remover(papel: PapelNomeacao, delegadoId?: number): Promise<void> {
    if (selecionado == null) return
    try {
      await window.api.nomeacoes.remover(selecionado, papel, delegadoId)
      avisar('Nomeação removida.', 'sucesso', anular)
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
      return
    }
    await carregarJogos()
    await carregarUrgentes()
    await carregarCandidatos(selecionado)
  }

  async function gerarProposta(
    jogoIds: number[],
    opcoes: { grupo: GrupoDelegados; delegadoIds: number[] }
  ): Promise<void> {
    setAPropor(true)
    try {
      setProposta(await window.api.nomeacoes.proposta(jogoIds, opcoes))
      setAConfigurarProposta(false)
      setErro(null)
    } catch (e) {
      const texto = `Não foi possível calcular a proposta: ${mensagemDeErro(e)}`
      setErro(texto)
      avisar(texto, 'erro')
    } finally {
      setAPropor(false)
    }
  }

  async function aplicarProposta(): Promise<void> {
    if (!proposta) return
    try {
      const n = await window.api.nomeacoes.aplicarProposta(proposta.propostas)
      avisar(`${n} nomeações gravadas.`)
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
      return
    }
    setProposta(null)
    await carregarJogos()
    await carregarUrgentes()
    if (selecionado != null) await carregarCandidatos(selecionado)
  }

  // O filtro de nível é só de apresentação: a ordenação e a pontuação continuam
  // a ser feitas com todos os delegados, para as posições não mudarem de
  // significado conforme o que está a ser mostrado.
  const visiveis = nivel === 'TODOS' ? candidatos : candidatos.filter((c) => c.nivel === nivel)
  const elegiveis = visiveis.filter((c) => c.elegivel)
  const bloqueados = visiveis.filter((c) => !c.elegivel)
  const kmMaximo = Math.max(1, ...candidatos.map((c) => c.kmEpoca))
  const escondidosPeloNivel = candidatos.length - visiveis.length

  const jaVaoAEsteJogo = new Set(jogo?.nomeacoes.map((n) => n.delegadoId) ?? [])

  const pontos: PontoMapa[] = visiveis
    .filter((c): c is Candidato & { lat: number; lng: number } => c.lat != null && c.lng != null)
    .map((c) => {
      const posicao = candidatos.filter((o) => o.elegivel).indexOf(c) + 1
      const nomeado = jaVaoAEsteJogo.has(c.delegadoId)
      return {
        id: c.delegadoId,
        lat: c.lat,
        lng: c.lng,
        etiqueta: nomeado ? '✓' : c.elegivel ? String(posicao) : '×',
        titulo: nomeado
          ? `${c.nome} — nomeado · ${formatarKm(c.kmViagem)} ida e volta`
          : `${posicao > 0 ? `${posicao}. ` : ''}${c.nome} — ${formatarKm(c.kmViagem)} ida e volta`,
        // Quem já vai a este jogo destaca-se de quem é só candidato.
        classe: nomeado
          ? 'nomeado'
          : !c.elegivel
            ? 'bloqueado'
            : posicao <= 3
              ? 'top'
              : posicao <= 10
                ? 'medio'
                : 'baixo'
      }
    })

  /** Traz para a lista os jogos escolhidos no popup das outras competições. */
  async function trazerParaALista(jogoIds: number[]): Promise<void> {
    try {
      for (const id of jogoIds) await window.api.jogos.levaDelegado(id, true)
      await carregarJogos()
      await carregarOutros()
      await carregarUrgentes()
      setEscolherOutros(false)
      avisar(
        jogoIds.length === 1
          ? '1 jogo entra na lista para nomeação.'
          : `${jogoIds.length} jogos entram na lista para nomeação.`
      )
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    }
  }

  /**
   * Traz um jogo para a lista de trabalho, ou devolve-o à regra da competição.
   * É o gesto para os jogos da Taça e afins, em que o delegado é a exceção.
   */
  async function marcarLevaDelegado(jogo: JogoDetalhado, leva: boolean | null): Promise<void> {
    try {
      await window.api.jogos.levaDelegado(jogo.id, leva)
      await carregarJogos()
      await carregarOutros()
      await carregarUrgentes()
      avisar(
        leva
          ? `${jogo.clubeCasaNome} × ${jogo.clubeForaNome} entra na lista para nomeação.`
          : `${jogo.clubeCasaNome} × ${jogo.clubeForaNome} sai da lista.`
      )
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    }
  }

  /**
   * Esconder tira o jogo da lista de trabalho sem apagar nada: fica no ecrã
   * Escondidos até a data passar. É para os jogos que não competem ao
   * coordenador, e por isso não pede confirmação — repor é um clique.
   */
  async function esconder(jogo: JogoDetalhado): Promise<void> {
    try {
      await window.api.jogos.esconder(jogo.id, true)
      if (selecionado === jogo.id) setSelecionado(null)
      await carregarJogos()
      avisar(`${jogo.clubeCasaNome} × ${jogo.clubeForaNome} escondido. Pode repô-lo em Escondidos.`)
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    }
  }

  // Um jogo só está nomeado quando tem principal: sombras não chegam.
  const nomeados = jogos.filter((j) => temPrincipal(j.nomeacoes)).length

  /**
   * Desenha a viagem de quem já está nomeado. Só se pede o traçado depois de
   * haver nomeação: é uma chamada ao serviço de rotas por delegado, e não vale
   * a pena fazê-la para candidatos que podem nem ser escolhidos.
   */
  useEffect(() => {
    const recintoId = jogo?.recintoId
    const ids = jogo?.nomeacoes.map((n) => n.delegadoId) ?? []
    if (recintoId == null || ids.length === 0) {
      setTrajetos([])
      return
    }
    let cancelado = false
    void Promise.all(ids.map((id) => window.api.geo.trajeto(id, recintoId))).then((lista) => {
      // O jogo pode ter mudado enquanto as rotas vinham a caminho.
      if (!cancelado) setTrajetos(lista.filter((t): t is TrajetoMapa => t !== null))
    })
    return () => {
      cancelado = true
    }
  }, [jogo?.id, jogo?.recintoId, jogo?.nomeacoes.map((n) => n.delegadoId).join(',')])

  /** O que a janela do mapa tem de desenhar. */
  const estadoDoMapa = {
    tilesUrl,
    recinto:
      jogo?.recintoLat != null && jogo.recintoLng != null
        ? { lat: jogo.recintoLat, lng: jogo.recintoLng, titulo: jogo.recintoNome ?? 'Recinto' }
        : null,
    pontos,
    trajetos,
    realcado,
    legenda: `${jogo?.recintoNome ?? 'sem recinto'} · ${pontos.length} delegados localizados`
  }

  // Enquanto o mapa estiver destacado, é este ecrã que lhe diz o que desenhar.
  useEffect(() => {
    if (!mapaDestacado) return
    void window.api.mapa.enviarEstado({
      tilesUrl,
      recinto:
        jogo?.recintoLat != null && jogo.recintoLng != null
          ? { lat: jogo.recintoLat, lng: jogo.recintoLng, titulo: jogo.recintoNome ?? 'Recinto' }
          : null,
      pontos,
      trajetos,
      realcado,
      legenda: `${jogo?.recintoNome ?? 'sem recinto'} · ${pontos.length} delegados localizados`
    })
  }, [mapaDestacado, tilesUrl, jogo, pontos, trajetos, realcado])

  useEffect(() => {
    const largarRealce = window.api.mapa.aoRealcar((id) => setRealcado(id))
    const largarJuntar = window.api.mapa.aoJuntar(() => setMapaDestacado(false))
    return () => {
      largarRealce()
      largarJuntar()
    }
  }, [])

  /** Levar a semana até ao jogo escolhido na faixa, e selecioná-lo. */
  function irParaJogo(jogoId: number): void {
    const jogo = urgentes.find((j) => j.id === jogoId)
    const data = paraDataLocal(jogo?.dataHora ?? null)
    if (data) setSemana(inicioDaSemana(data))
    setSelecionado(jogoId)
  }

  return (
    <>
      <FaixaUrgentes jogos={urgentes} aoEscolher={irParaJogo} />

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
            {formatarData(paraDataIso(semana))} — {formatarData(paraDataIso(new Date(fim.getTime() - 86400000)))}
          </h1>
          <div className="subtitulo">
            {jogos.length} jogos · {nomeados} com delegado
          </div>
        </div>

        <div style={{ flex: '1 1 160px', maxWidth: 220, minWidth: 120 }}>
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

        <div style={{ flex: '1 1 140px', maxWidth: 180, minWidth: 110 }}>
          <input
            type="search"
            placeholder="Clube ou recinto…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>

        <div className="espacador" />
        <button
          className="botao primario"
          onClick={() => setAConfigurarProposta(true)}
          disabled={aPropor}
          title="Escolher a semana e os jogos antes de gerar"
        >
          {aPropor ? 'A calcular…' : 'Proposta automática…'}
        </button>
      </div>

      <div className="corpo-ecra sem-padding">
        <div className={classes('tres-paineis', mapaDestacado && 'sem-mapa')}>
          {/* ------------------------------------------------ jogos */}
          <div className="painel">
            <div className="painel-cabecalho">
              <h2>Jogos da semana</h2>
            </div>
            <div className="painel-corpo">
              {jogos.length === 0 && (
                <div className="vazio">
                  {fim.getTime() <= hoje.getTime() ? (
                    <>
                      Esta semana já passou.
                      <br />
                      Os jogos que já se realizaram estão no ecrã <b>Histórico</b>.
                    </>
                  ) : (
                    <>
                      Sem jogos por realizar nesta semana com os filtros atuais.
                      <br />
                      Importe competições no ecrã <b>Importação</b>.
                    </>
                  )}
                </div>
              )}
              {jogos.map((j) => (
                <div
                  key={j.id}
                  className={classes(
                    'item-jogo',
                    temPrincipal(j.nomeacoes) && 'nomeado',
                    !temPrincipal(j.nomeacoes) && j.nomeacoes.length > 0 && 'parcial',
                    j.id === selecionado && 'selecionado'
                  )}
                  onClick={() => setSelecionado(j.id)}
                >
                  <div className="accoes-jogo">
                    <button
                      className="accao"
                      title="Corrigir data, hora ou recinto deste jogo"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAEditar(j)
                      }}
                    >
                      ✎
                    </button>
                    {j.levaDelegado === true && (
                      <button
                        className="accao"
                        title="Este jogo foi acrescentado à mão — tirar da lista de nomeações"
                        onClick={(e) => {
                          e.stopPropagation()
                          void marcarLevaDelegado(j, null)
                        }}
                      >
                        −
                      </button>
                    )}
                    <button
                      className="accao esconder"
                      title="Esconder este jogo (fica recuperável em Escondidos)"
                      onClick={(e) => {
                        // Sem isto, esconder também selecionava o jogo que vai sair da lista.
                        e.stopPropagation()
                        void esconder(j)
                      }}
                    >
                      ✕
                    </button>
                  </div>
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
                  {(j.ultimaAlteracao || j.editadoManualmente) && (
                    <div className="alteracao" title={j.ultimaAlteracao ?? undefined}>
                      {j.editadoManualmente && <span className="etiqueta">corrigido à mão</span>}
                      {j.ultimaAlteracao && <span className="texto">{j.ultimaAlteracao}</span>}
                    </div>
                  )}
                  {j.nomeacoes.length > 0 && (
                    <div className="chips">
                      {j.nomeacoes.map((n) => (
                        <span
                          key={n.id}
                          className={classes('chip-delegado', classeDoPapel(n.papel))}
                          title={etiquetaDoPapel(n.papel)}
                        >
                          {letraDoPapel(n.papel)} {n.delegadoNome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {outros.length > 0 && (
                <div className="outros-jogos">
                  <button
                    className="cabecalho"
                    title="Escolher jogos destas competições para nomear"
                    onClick={() => setEscolherOutros(true)}
                  >
                    <span className="seta" aria-hidden>
                      ▸
                    </span>
                    {outros.length} {outros.length === 1 ? 'jogo' : 'jogos'} de competições sem delegado
                    fixo
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* -------------------------------------------- candidatos */}
          <div className="painel">
            <div className="painel-cabecalho">
              {jogo ? (
                <>
                  <div className="linha">
                    <h2>Candidatos</h2>
                    <div className="espacador" style={{ marginLeft: 'auto' }} />
                    <div className="grupo-botoes">
                      {(['TODOS', 'ELITE', 'PRINCIPAL'] as const).map((n) => (
                        <button key={n} className={classes(nivel === n && 'ativo')} onClick={() => setNivel(n)}>
                          {{ TODOS: 'Todos', ELITE: 'Elite', PRINCIPAL: 'Principais' }[n]}
                        </button>
                      ))}
                    </div>
                  </div>
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
                        <span className={classes('emblema', n.papel === 'SOMBRA' ? 'neutro' : 'ok')}>
                          {etiquetaDoPapel(n.papel).replace('Delegado ', '')}
                        </span>
                        <b>
                          {n.delegadoNumero} — {n.delegadoNome}
                        </b>
                        <span className="silencioso">{formatarKm(n.km)}</span>
                        <div className="espacador" style={{ marginLeft: 'auto' }} />
                        <button
                          className="botao pequeno perigo"
                          onClick={() => remover(n.papel, n.delegadoId)}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aCarregarCandidatos && <div className="vazio">A calcular distâncias e prioridades…</div>}

              {!aCarregarCandidatos && jogo && escondidosPeloNivel > 0 && (
                <div className="silencioso" style={{ marginBottom: 8 }}>
                  {escondidosPeloNivel}{' '}
                  {escondidosPeloNivel === 1 ? 'delegado escondido' : 'delegados escondidos'} pelo filtro de
                  nível. A posição de cada um continua a ser a do ranking completo.
                </div>
              )}

              {!aCarregarCandidatos &&
                jogo &&
                elegiveis.map((c, i) => (
                  <CartaoCandidato
                    key={c.delegadoId}
                    candidato={c}
                    posicao={i + 1}
                    realcado={realcado === c.delegadoId}
                    kmMaximo={kmMaximo}
                    usaDelegadoAssistente={usaDelegadoAssistente}
                    sombrasCheias={sombras(jogo.nomeacoes).length >= MAX_SOMBRAS}
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
                      usaDelegadoAssistente={usaDelegadoAssistente}
                      sombrasCheias={sombras(jogo?.nomeacoes ?? []).length >= MAX_SOMBRAS}
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
          <div className={classes('painel', mapaDestacado && 'escondido')}>
            <div className="painel-cabecalho com-accao">
              <div className="titulo">
                <h2>Mapa</h2>
                <div className="silencioso" style={{ marginTop: 3 }}>
                  {jogo?.recintoNome ?? 'sem recinto'} · {pontos.length} delegados localizados
                </div>
              </div>
              <button
                className="botao pequeno"
                title="Abrir o mapa numa janela à parte e dar o espaço todo à lista"
                onClick={async () => {
                  // O estado vai já: a janela ainda está a carregar, e o
                  // processo principal guarda-o para lho entregar quando abrir.
                  await window.api.mapa.enviarEstado(estadoDoMapa)
                  await window.api.mapa.destacar()
                  setMapaDestacado(true)
                }}
              >
                ⧉ Janela à parte
              </button>
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
                trajetos={trajetos}
                realcado={realcado}
                aoSelecionar={(id) => setRealcado(id)}
                aoRealcar={setRealcado}
              />
            </div>
          </div>
        </div>
      </div>

      {escolherOutros && (
        <EscolherOutrosJogos
          titulo="Jogos de competições sem delegado fixo"
          subtitulo="Nestas competições só alguns jogos levam delegado. Escolha os que quer nomear."
          jogos={outros}
          textoConfirmar={(n) => (n === 1 ? 'Trazer 1 jogo para a lista' : `Trazer ${n} jogos para a lista`)}
          aFechar={() => setEscolherOutros(false)}
          aoConfirmar={trazerParaALista}
        />
      )}

      {aEditar && (
        <EditarJogo
          jogo={aEditar}
          aoFechar={() => setAEditar(null)}
          aoGuardar={async () => {
            await carregarJogos()
            await carregarUrgentes()
            if (selecionado != null) await carregarCandidatos(selecionado)
          }}
        />
      )}

      {aConfigurarProposta && (
        <ConfigurarProposta
          semanaInicial={semana}
          aGerar={aPropor}
          aFechar={() => setAConfigurarProposta(false)}
          aoGerar={(ids, opcoes) => void gerarProposta(ids, opcoes)}
        />
      )}

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
                  <th>Assistente</th>
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
                      {p.assistente ? (
                        <>
                          {p.assistente.nome}
                          <div className="silencioso">{formatarKm(p.assistente.km)}</div>
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
