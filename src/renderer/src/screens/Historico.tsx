import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Competicao, JogoDetalhado } from '@shared/tipos'
import { classes, formatarDataHora, formatarKm } from '../lib/formato'
import { ColunaOrdenavel, useOrdenacao, type Valores } from '../lib/ordenacao'
import CorrigirNomeacao from '../components/CorrigirNomeacao'
import EscolherOutrosJogos from '../components/EscolherOutrosJogos'
import Paginacao, { usePaginacao } from '../components/Paginacao'
import { avisar, mensagemDeErro } from '../lib/avisos'

/**
 * O que já foi feito: os jogos que já ficaram para trás e que levavam delegado.
 *
 * Serve para responder às perguntas do dia a dia — quem foi àquele jogo, quantos
 * jogos e quilómetros leva cada delegado, quando é que alguém esteve num clube.
 *
 * Entram todos os jogos passados das competições com delegado em todos os
 * jogos, e das outras só os escolhidos. Os restantes jogos passados dessas
 * competições ficam num bloco à parte, como na lista da semana, para se poder
 * trazer um jogo que afinal teve delegado e registar quem lá foi.
 */
export default function Historico(): JSX.Element {
  const [jogos, setJogos] = useState<JogoDetalhado[]>([])
  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [competicaoId, setCompeticaoId] = useState<number | ''>('')
  const [texto, setTexto] = useState('')
  const [aCarregar, setACarregar] = useState(true)
  const [aCorrigir, setACorrigir] = useState<JogoDetalhado | null>(null)
  const [outros, setOutros] = useState<JogoDetalhado[]>([])
  const [escolherOutros, setEscolherOutros] = useState(false)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      setJogos(
        await window.api.jogos.historico({
          competicaoId: competicaoId === '' ? undefined : competicaoId,
          texto: texto.trim() || undefined
        })
      )
    } finally {
      setACarregar(false)
    }
  }, [competicaoId, texto])

  // Os jogos passados das competições sem delegado fixo que ninguém escolheu.
  // Todos: a competição e a procura escolhem-se dentro do popup.
  const carregarOutros = useCallback(async () => {
    setOutros(await window.api.jogos.historico({ levaDelegado: 'SEM' }))
  }, [])

  useEffect(() => {
    void carregar()
    void carregarOutros()
  }, [carregar, carregarOutros])

  /**
   * Traz para o histórico os jogos escolhidos no popup. Com um só jogo abre logo
   * a correção, porque quem o traz quer registar quem lá foi; com vários, cada
   * um fica na tabela com o seu botão Corrigir.
   */
  async function trazerParaOHistorico(jogoIds: number[]): Promise<void> {
    try {
      for (const id of jogoIds) await window.api.jogos.levaDelegado(id, true)
      await Promise.all([carregar(), carregarOutros()])
      setEscolherOutros(false)
      if (jogoIds.length === 1) {
        const jogo = await window.api.jogos.obter(jogoIds[0])
        if (jogo) setACorrigir(jogo)
        avisar('1 jogo passa a constar no histórico.')
      } else {
        avisar(`${jogoIds.length} jogos passam a constar no histórico. Use Corrigir para registar quem lá foi.`)
      }
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    }
  }

  /** Devolve à regra da competição um jogo trazido à mão que ficou sem delegado. */
  async function retirar(jogo: JogoDetalhado): Promise<void> {
    try {
      await window.api.jogos.levaDelegado(jogo.id, null)
      await Promise.all([carregar(), carregarOutros()])
      avisar(`${jogo.clubeCasaNome} × ${jogo.clubeForaNome} sai do histórico.`)
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    }
  }

  useEffect(() => {
    void window.api.competicoes.listar().then(setCompeticoes)
  }, [])

  // O filtro por texto é do lado do servidor (clubes e recinto); o de delegado
  // é aqui, porque quem procura por um delegado quer ver as linhas dele.
  const [delegado, setDelegado] = useState('')
  const visiveis = useMemo(() => {
    const procura = delegado.trim().toLowerCase()
    if (!procura) return jogos
    return jogos.filter((j) =>
      j.nomeacoes.some(
        (n) => n.delegadoNome.toLowerCase().includes(procura) || n.delegadoNumero.includes(procura)
      )
    )
  }, [jogos, delegado])

  // Cada coluna ordena a lista: por data, por competição, por clubes, por
  // recinto ou pelo delegado nomeado.
  const colunas: Valores<JogoDetalhado, 'data' | 'competicao' | 'jogo' | 'recinto' | 'delegados' | 'km'> = useMemo(
    () => ({
      data: (j) => j.dataHora,
      competicao: (j) => j.competicaoNome,
      jogo: (j) => `${j.clubeCasaNome} ${j.clubeForaNome}`,
      recinto: (j) => j.recintoNome,
      delegados: (j) => j.nomeacoes.map((n) => n.delegadoNome).join(', ') || null,
      km: (j) => j.nomeacoes.reduce((s, n) => s + (n.km ?? 0), 0)
    }),
    []
  )
  // Por omissão, o mais recente primeiro: é o que se procura num histórico.
  const { ordenadas, ordem, alternar } = useOrdenacao(visiveis, colunas, { coluna: 'data', sentido: 'desc' })
  const paginacao = usePaginacao(ordenadas)

  const kmTotais = visiveis.reduce(
    (soma, j) => soma + j.nomeacoes.reduce((s, n) => s + (n.km ?? 0), 0),
    0
  )
  const nomeacoes = visiveis.reduce((soma, j) => soma + j.nomeacoes.length, 0)
  // Jogos que deviam ter levado delegado e passaram sem ninguém: é a falha
  // que o histórico agora deixa ver.
  const semDelegado = visiveis.filter((j) => j.nomeacoes.length === 0).length

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Histórico</h1>
        <div className="subtitulo">
          {visiveis.length} {visiveis.length === 1 ? 'jogo realizado' : 'jogos realizados'} · {nomeacoes}{' '}
          {nomeacoes === 1 ? 'nomeação' : 'nomeações'} · {formatarKm(kmTotais)}
          {semDelegado > 0 && (
            <>
              {' '}
              · <b>{semDelegado}</b> {semDelegado === 1 ? 'ficou' : 'ficaram'} sem delegado
            </>
          )}
        </div>
      </div>

      <div className="corpo-ecra">
        <div className="cartao">
          <div className="linha" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <select
              className="campo"
              style={{ maxWidth: 260 }}
              value={competicaoId}
              onChange={(e) => setCompeticaoId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Todas as competições</option>
              {competicoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <input
              className="campo"
              style={{ maxWidth: 220 }}
              placeholder="Clube ou recinto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <input
              className="campo"
              style={{ maxWidth: 220 }}
              placeholder="Delegado (nome ou número)"
              value={delegado}
              onChange={(e) => setDelegado(e.target.value)}
            />
          </div>

          {aCarregar && <div className="vazio">A carregar…</div>}

          {!aCarregar && visiveis.length === 0 && (
            <div className="vazio">
              Ainda não há jogos realizados nesta lista.
              <br />
              Um jogo entra aqui sozinho quatro horas depois da hora de início.
            </div>
          )}

          {visiveis.length > 0 && (
            <table className="tabela">
              <thead>
                <tr>
                  <ColunaOrdenavel coluna="data" ordem={ordem} alternar={alternar}>
                    Data
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="competicao" ordem={ordem} alternar={alternar}>
                    Competição
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="jogo" ordem={ordem} alternar={alternar}>
                    Jogo
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="recinto" ordem={ordem} alternar={alternar}>
                    Recinto
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="delegados" ordem={ordem} alternar={alternar}>
                    Delegados
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="km" ordem={ordem} alternar={alternar} className="num">
                    Km
                  </ColunaOrdenavel>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paginacao.visiveis.map((j) => (
                  <tr key={j.id}>
                    <td>{formatarDataHora(j.dataHora)}</td>
                    <td>{j.competicaoNome}</td>
                    <td>
                      <b>
                        {j.clubeCasaNome} × {j.clubeForaNome}
                      </b>
                    </td>
                    <td className="silencioso">{j.recintoNome ?? '—'}</td>
                    <td>
                      {j.nomeacoes.length === 0 && (
                        <span className="emblema alerta">sem delegado</span>
                      )}
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
                    </td>
                    <td className="num">
                      {formatarKm(j.nomeacoes.reduce((s, n) => s + (n.km ?? 0), 0))}
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {/* Só se retira um jogo escolhido à mão enquanto não tem
                          ninguém: com delegado, os km dele contam na época. */}
                      {j.levaDelegado === true && j.nomeacoes.length === 0 && (
                        <button
                          className="botao pequeno"
                          title="Este jogo foi acrescentado à mão — tirar do histórico"
                          onClick={() => void retirar(j)}
                        >
                          Retirar
                        </button>
                      )}{' '}
                      <button
                        className="botao pequeno"
                        title="Corrigir quem foi a este jogo"
                        onClick={() => setACorrigir(j)}
                      >
                        Corrigir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <Paginacao
            pagina={paginacao.pagina}
            paginas={paginacao.paginas}
            total={ordenadas.length}
            irPara={paginacao.irPara}
          />

          {outros.length > 0 && (
            <div className="outros-jogos">
              <button
                className="cabecalho"
                title="Escolher jogos destas competições para o histórico"
                onClick={() => setEscolherOutros(true)}
              >
                <span className="seta" aria-hidden>
                  ▸
                </span>
                {outros.length} {outros.length === 1 ? 'jogo' : 'jogos'} de competições sem delegado fixo
              </button>
            </div>
          )}
        </div>
      </div>

      {escolherOutros && (
        <EscolherOutrosJogos
          titulo="Jogos de competições sem delegado fixo"
          subtitulo="Jogos já realizados em que só alguns levam delegado. Escolha os que tiveram delegado."
          jogos={outros}
          textoConfirmar={(n) => (n === 1 ? 'Trazer 1 jogo para o histórico' : `Trazer ${n} jogos para o histórico`)}
          aFechar={() => setEscolherOutros(false)}
          aoConfirmar={trazerParaOHistorico}
        />
      )}

      {aCorrigir && (
        <CorrigirNomeacao
          jogo={aCorrigir}
          aoFechar={() => setACorrigir(null)}
          aoGuardar={async () => {
            await carregar()
            // A lista foi recarregada: o diálogo tem de passar a mostrar o
            // estado novo, senão continuava a exibir o delegado antigo.
            const atualizado = await window.api.jogos.obter(aCorrigir.id)
            if (atualizado) setACorrigir(atualizado)
          }}
        />
      )}
    </>
  )
}
