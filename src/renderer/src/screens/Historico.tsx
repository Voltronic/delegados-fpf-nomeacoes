import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Competicao, JogoDetalhado } from '@shared/tipos'
import { classes, formatarDataHora, formatarKm } from '../lib/formato'
import { ColunaOrdenavel, useOrdenacao, type Valores } from '../lib/ordenacao'

/**
 * O que já foi feito: jogos realizados que tiveram delegado nomeado.
 *
 * Serve para responder às perguntas do dia a dia — quem foi àquele jogo, quantos
 * jogos e quilómetros leva cada delegado, quando é que alguém esteve num clube.
 * Jogos passados sem nomeação não entram: não houve trabalho para registar.
 */
export default function Historico(): JSX.Element {
  const [jogos, setJogos] = useState<JogoDetalhado[]>([])
  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [competicaoId, setCompeticaoId] = useState<number | ''>('')
  const [texto, setTexto] = useState('')
  const [aCarregar, setACarregar] = useState(true)

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

  useEffect(() => {
    void carregar()
  }, [carregar])

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

  const kmTotais = visiveis.reduce(
    (soma, j) => soma + j.nomeacoes.reduce((s, n) => s + (n.km ?? 0), 0),
    0
  )
  const nomeacoes = visiveis.reduce((soma, j) => soma + j.nomeacoes.length, 0)

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Histórico</h1>
        <div className="subtitulo">
          {visiveis.length} {visiveis.length === 1 ? 'jogo realizado' : 'jogos realizados'} · {nomeacoes}{' '}
          {nomeacoes === 1 ? 'nomeação' : 'nomeações'} · {formatarKm(kmTotais)}
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
              Ainda não há jogos realizados com delegado nomeado.
              <br />
              Um jogo entra aqui sozinho depois de passar a data.
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
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((j) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
