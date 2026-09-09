import type { JogoDetalhado } from '@shared/tipos'
import { diasAte, formatarDataHora } from '../lib/formato'

/** Dias a partir dos quais um jogo por nomear deixa de ser urgente. */
const DIAS = 7

interface Props {
  jogos: JogoDetalhado[]
  aoEscolher: (jogoId: number) => void
}

/**
 * Faixa com os jogos que estão a chegar e ainda não têm ninguém nomeado.
 *
 * O erro que custa caro não é nomear mal, é o jogo que passa despercebido até
 * ser tarde. Fica sempre à vista uma linha com a contagem, e a lista só se abre
 * quando o rato lá passa — não rouba espaço ao trabalho nem obriga a clicar.
 * Quando não há nada por nomear nos próximos dias, a faixa desaparece.
 */
export default function FaixaUrgentes({ jogos, aoEscolher }: Props): JSX.Element | null {
  if (jogos.length === 0) return null

  const dias = (jogo: JogoDetalhado): number => diasAte(jogo.dataHora) ?? DIAS

  return (
    <div className="faixa-urgentes">
      <div className="resumo">
        <span aria-hidden>⚠</span>
        <b>
          {jogos.length} {jogos.length === 1 ? 'jogo por nomear' : 'jogos por nomear'} nos próximos {DIAS}{' '}
          dias
        </b>
        <span className="silencioso">passe o rato para ver a lista</span>
      </div>

      <div className="lista">
        {jogos.map((j) => {
          const falta = dias(j)
          return (
            <button key={j.id} className="linha-urgente" onClick={() => aoEscolher(j.id)}>
              <span className={falta <= 1 ? 'prazo urgente' : 'prazo'}>
                {falta <= 0 ? 'hoje' : falta === 1 ? 'amanhã' : `${falta} dias`}
              </span>
              <span className="quando">{formatarDataHora(j.dataHora)}</span>
              <span className="equipas">
                {j.clubeCasaNome} × {j.clubeForaNome}
              </span>
              <span className="silencioso">{j.competicaoNome}</span>
              <span className="silencioso">{j.recintoNome ?? 'recinto por indicar'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
