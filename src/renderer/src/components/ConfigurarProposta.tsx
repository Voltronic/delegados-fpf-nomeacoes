import { useCallback, useEffect, useState } from 'react'
import type { JogoDetalhado } from '@shared/tipos'
import { diasAte } from '@shared/datas'
import { classes, formatarDataHora, inicioDaSemana, paraDataIso } from '../lib/formato'

interface Props {
  /** Semana por onde a janela abre — normalmente a que está a ser vista. */
  semanaInicial: Date
  aFechar: () => void
  aoGerar: (jogoIds: number[]) => void
  aGerar: boolean
}

/**
 * Escolher o que entra na proposta automática, antes de a calcular.
 *
 * A proposta é um cálculo demorado e o coordenador raramente quer "tudo o que
 * está no ecrã": quer uma semana à escolha — muitas vezes a seguinte, para
 * preparar com antecedência — e, dentro dela, só alguns jogos. Perguntar antes
 * evita gerar uma proposta inteira para a deitar fora a seguir.
 */
export default function ConfigurarProposta({
  semanaInicial,
  aFechar,
  aoGerar,
  aGerar
}: Props): JSX.Element {
  const [semana, setSemana] = useState(inicioDaSemana(semanaInicial))
  const [jogos, setJogos] = useState<JogoDetalhado[]>([])
  const [escolhidos, setEscolhidos] = useState<Set<number>>(new Set())
  const [aCarregar, setACarregar] = useState(true)

  const fim = new Date(semana)
  fim.setDate(fim.getDate() + 6)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const ate = new Date(semana)
      ate.setDate(ate.getDate() + 7)
      const lista = await window.api.jogos.listar({
        de: paraDataIso(semana),
        ate: `${paraDataIso(ate)}T23:59`
      })
      setJogos(lista)
      // Por omissão entram os que ainda não têm ninguém: propor para um jogo já
      // nomeado é trabalho perdido, mas continua a poder marcar-se à mão.
      setEscolhidos(new Set(lista.filter((j) => j.nomeacoes.length === 0).map((j) => j.id)))
    } finally {
      setACarregar(false)
    }
  }, [semana])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const alternar = (id: number): void =>
    setEscolhidos((atuais) => {
      const novos = new Set(atuais)
      if (novos.has(id)) novos.delete(id)
      else novos.add(id)
      return novos
    })

  const marcar = (quais: JogoDetalhado[]): void => setEscolhidos(new Set(quais.map((j) => j.id)))

  return (
    <div className="modal-fundo" onClick={aFechar}>
      <div className="modal" style={{ width: 'min(760px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Proposta automática</h2>
          <span className="silencioso">Escolha a semana e os jogos antes de gerar</span>
        </header>

        <div className="modal-corpo">
          <div className="linha" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <div className="grupo-botoes">
              <button onClick={() => setSemana(new Date(semana.getTime() - 7 * 86400000))}>‹</button>
              <button onClick={() => setSemana(inicioDaSemana(new Date()))}>Semana atual</button>
              <button onClick={() => setSemana(new Date(semana.getTime() + 7 * 86400000))}>›</button>
            </div>
            <b>
              {semana.toLocaleDateString('pt-PT')} — {fim.toLocaleDateString('pt-PT')}
            </b>
            <div className="espacador" style={{ marginLeft: 'auto' }} />
            <div className="grupo-botoes">
              <button onClick={() => marcar(jogos.filter((j) => j.nomeacoes.length === 0))}>
                Por nomear
              </button>
              <button onClick={() => marcar(jogos.filter((j) => diasAte(j.dataHora) === 0))}>Só hoje</button>
              <button onClick={() => marcar(jogos)}>Todos</button>
              <button onClick={() => marcar([])}>Nenhum</button>
            </div>
          </div>

          {aCarregar && <div className="vazio">A carregar…</div>}

          {!aCarregar && jogos.length === 0 && (
            <div className="vazio">Não há jogos nesta semana.</div>
          )}

          {jogos.length > 0 && (
            <table className="tabela">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Data</th>
                  <th>Jogo</th>
                  <th>Competição</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {jogos.map((j) => (
                  <tr
                    key={j.id}
                    className={classes(!escolhidos.has(j.id) && 'silencioso')}
                    onClick={() => alternar(j.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={escolhidos.has(j.id)}
                        onChange={() => alternar(j.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{formatarDataHora(j.dataHora)}</td>
                    <td>
                      <b>
                        {j.clubeCasaNome} × {j.clubeForaNome}
                      </b>
                    </td>
                    <td className="silencioso">{j.competicaoNome}</td>
                    <td>
                      {j.nomeacoes.length === 0 ? (
                        <span className="emblema neutro">por nomear</span>
                      ) : (
                        <span className="emblema ok">
                          {j.nomeacoes.map((n) => n.delegadoNome).join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer>
          <button
            className="botao primario"
            disabled={aGerar || escolhidos.size === 0}
            onClick={() => aoGerar([...escolhidos])}
          >
            {aGerar ? 'A calcular…' : `Gerar proposta para ${escolhidos.size} jogos`}
          </button>
          <button className="botao" onClick={aFechar} disabled={aGerar}>
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  )
}
