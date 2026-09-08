import { useCallback, useEffect, useState } from 'react'
import type { JogoDetalhado } from '@shared/tipos'
import { classes, formatarDataHora } from '../lib/formato'
import { avisar, mensagemDeErro } from '../lib/avisos'

/**
 * Jogos que o coordenador tirou da lista de trabalho.
 *
 * Nada é apagado: um jogo escondido continua na base de dados e volta à lista
 * com um clique. Os que já passaram da data deixam de aparecer aqui — foram
 * escondidos por não interessarem, e depois de jogados não há nada a repor.
 */
export default function Escondidos(): JSX.Element {
  const [jogos, setJogos] = useState<JogoDetalhado[]>([])
  const [aCarregar, setACarregar] = useState(true)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      setJogos(await window.api.jogos.escondidos())
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function repor(jogo: JogoDetalhado): Promise<void> {
    try {
      await window.api.jogos.esconder(jogo.id, false)
      await carregar()
      avisar(`${jogo.clubeCasaNome} × ${jogo.clubeForaNome} de volta à lista de jogos.`)
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    }
  }

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Escondidos</h1>
        <div className="subtitulo">
          {jogos.length === 0
            ? 'Nenhum jogo escondido'
            : `${jogos.length} ${jogos.length === 1 ? 'jogo escondido' : 'jogos escondidos'} por realizar`}
        </div>
      </div>

      <div className="corpo-ecra">
        <div className="cartao">
          <div className="silencioso" style={{ marginBottom: 10 }}>
            Um jogo escondido não aparece nas nomeações nem nas propostas automáticas, mas continua guardado.
            Depois de passar a data deixa de aparecer aqui.
          </div>

          {aCarregar && <div className="vazio">A carregar…</div>}

          {!aCarregar && jogos.length === 0 && (
            <div className="vazio">
              Não há jogos escondidos.
              <br />
              Para esconder um, carregue no ✕ da linha do jogo no ecrã <b>Nomeações</b>.
            </div>
          )}

          {jogos.length > 0 && (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Competição</th>
                  <th>Jogo</th>
                  <th>Recinto</th>
                  <th>Delegados</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {jogos.map((j) => (
                  <tr key={j.id}>
                    <td>{formatarDataHora(j.dataHora)}</td>
                    <td>{j.competicaoNome}</td>
                    <td>
                      <b>
                        {j.clubeCasaNome} × {j.clubeForaNome}
                      </b>
                    </td>
                    <td className="silencioso">{j.recintoNome ?? 'recinto por indicar'}</td>
                    <td>
                      {j.nomeacoes.length === 0 ? (
                        <span className="silencioso">—</span>
                      ) : (
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
                    </td>
                    <td className="num">
                      <button className="botao pequeno" onClick={() => repor(j)}>
                        Repor
                      </button>
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
