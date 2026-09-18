import { useEffect, useMemo, useState } from 'react'
import type { JogoDoDelegado, LinhaKmDelegado } from '@shared/tipos'
import { classeDoPapel, contaParaEstatisticas, etiquetaDoPapel } from '@shared/tipos'
import { classes, formatarDataHora, formatarKm, formatarMinutos } from '../lib/formato'

interface Props {
  delegado: LinhaKmDelegado
  /** Época a que a lista diz respeito; `undefined` são todas. */
  seasonId?: number
  etiquetaEpoca: string
  aoFechar: () => void
}

/** Sem acentos e em minúsculas, para a procura encontrar "taca" em "TAÇA". */
const semAcentos = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Os jogos de um delegado numa época, com a viagem de cada um.
 *
 * A tabela do dashboard diz quantos km um delegado tem, e é aí que começam as
 * perguntas: de onde vêm, que jogos foram, quais obrigaram a avião. Sem esta
 * lista a resposta era ir a jogo a jogo à mão.
 */
export default function JogosDoDelegado({
  delegado,
  seasonId,
  etiquetaEpoca,
  aoFechar
}: Props): JSX.Element {
  const [jogos, setJogos] = useState<JogoDoDelegado[]>([])
  const [procura, setProcura] = useState('')
  const [aCarregar, setACarregar] = useState(true)

  useEffect(() => {
    setACarregar(true)
    void window.api.dashboard
      .jogosDoDelegado(delegado.delegadoId, seasonId)
      .then(setJogos)
      .finally(() => setACarregar(false))
  }, [delegado.delegadoId, seasonId])

  // Esc fecha, como em qualquer janela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  // Cada palavra procurada tem de aparecer em alguma coluna da linha.
  const visiveis = useMemo(() => {
    const palavras = semAcentos(procura).split(/\s+/).filter(Boolean)
    if (!palavras.length) return jogos
    return jogos.filter((j) => {
      const onde = semAcentos(
        `${j.competicaoNome} ${j.clubeCasaNome} ${j.clubeForaNome} ${j.recintoNome ?? ''} ` +
          `${etiquetaDoPapel(j.papel)} ${formatarDataHora(j.dataHora)}`
      )
      return palavras.every((p) => onde.includes(p))
    })
  }, [jogos, procura])

  // Os totais seguem a procura: filtrar por competição mostra o peso dela.
  const totais = useMemo(() => {
    const contam = visiveis.filter((j) => contaParaEstatisticas(j.papel))
    return {
      jogos: contam.length,
      km: contam.reduce((soma, j) => soma + (j.km ?? 0), 0),
      minutos: contam.reduce((soma, j) => soma + (j.minutos ?? 0), 0),
      voos: contam.filter((j) => j.fonteDistancia === 'AVIAO').length,
      sombras: visiveis.length - contam.length
    }
  }, [visiveis])

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div
        className="modal jogos-do-delegado"
        style={{ width: 'min(900px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>
            {delegado.numero} — {delegado.nome}
          </h2>
          <span className="silencioso">{etiquetaEpoca}</span>
        </header>

        <div className="modal-corpo com-lista">
          <div className="linha" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              className="campo"
              type="search"
              style={{ maxWidth: 280 }}
              placeholder="Procurar competição, clube ou recinto"
              value={procura}
              autoFocus
              onChange={(e) => setProcura(e.target.value)}
            />
            <div className="espacador" style={{ marginLeft: 'auto' }} />
            <div className="silencioso">
              {totais.jogos} {totais.jogos === 1 ? 'jogo' : 'jogos'} · <b>{formatarKm(totais.km)}</b> ·{' '}
              {formatarMinutos(totais.minutos)}
              {totais.voos > 0 && (
                <>
                  {' '}
                  · <b>{totais.voos}</b> de avião
                </>
              )}
              {totais.sombras > 0 && <> · {totais.sombras} como sombra, que não contam</>}
            </div>
          </div>

          <div className="lista-rolavel">
            {aCarregar ? (
              <div className="vazio">A carregar…</div>
            ) : visiveis.length === 0 ? (
              <div className="vazio">
                {jogos.length === 0
                  ? 'Este delegado ainda não tem jogos nesta época.'
                  : 'Nenhum jogo corresponde à procura.'}
              </div>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Data</th>
                    <th>Jogo</th>
                    <th>Competição</th>
                    <th>Recinto</th>
                    <th style={{ width: 90 }}>Papel</th>
                    <th className="num" style={{ width: 90 }}>
                      Km
                    </th>
                    <th className="num" style={{ width: 80 }}>
                      Tempo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((j) => (
                    <tr key={`${j.jogoId}:${j.papel}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(j.dataHora)}</td>
                      <td>
                        <b>
                          {j.clubeCasaNome} × {j.clubeForaNome}
                        </b>
                      </td>
                      <td className="silencioso">{j.competicaoNome}</td>
                      <td className="silencioso">{j.recintoNome ?? 'por indicar'}</td>
                      <td>
                        <span className={classes('chip-delegado', classeDoPapel(j.papel))}>
                          {etiquetaDoPapel(j.papel).replace('Delegado ', '')}
                        </span>
                      </td>
                      <td className={classes('num', j.fonteDistancia === 'AVIAO' && 'com-voos')}>
                        {contaParaEstatisticas(j.papel) ? formatarKm(j.km) : '·'}
                        {j.fonteDistancia === 'AVIAO' && (
                          <span title="Deslocação com avião"> ✈</span>
                        )}
                      </td>
                      <td className="num silencioso">
                        {contaParaEstatisticas(j.papel) ? formatarMinutos(j.minutos) : '·'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <footer>
          <button className="botao primario" onClick={aoFechar}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  )
}
