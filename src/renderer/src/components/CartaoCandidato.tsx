import { useState } from 'react'
import type { Candidato, PapelNomeacao } from '@shared/tipos'
import { etiquetaDoPapel, MAX_SOMBRAS } from '@shared/tipos'
import { classes, formatarKm, formatarMinutos } from '../lib/formato'

interface Props {
  candidato: Candidato
  posicao: number
  realcado: boolean
  kmMaximo: number
  usaDelegadoAssistente: boolean
  /** O jogo já tem o máximo de sombras: não se pode acrescentar outra. */
  sombrasCheias: boolean
  papelAtribuido: PapelNomeacao | null
  aoNomear: (delegadoId: number, papel: PapelNomeacao) => void
  aoRealcar: (id: number | null) => void
}

/**
 * Cartão de um candidato. Mostra sempre as três coisas que o coordenador precisa
 * de comparar num relance — km da época, km desta viagem e histórico do clube —
 * e abre a decomposição do score a pedido, para justificar a ordem.
 */
export default function CartaoCandidato({
  candidato,
  posicao,
  realcado,
  kmMaximo,
  usaDelegadoAssistente,
  sombrasCheias,
  papelAtribuido,
  aoNomear,
  aoRealcar
}: Props): JSX.Element {
  const [aberto, setAberto] = useState(false)
  const acimaDaMedia = candidato.desvioKm > 0
  const larguraKm = kmMaximo > 0 ? Math.min(100, (candidato.kmEpoca / kmMaximo) * 100) : 0

  // Um delegado não acumula os dois papéis no mesmo jogo: quem já está nomeado
  // tem de ser removido antes de trocar de papel.
  const jaNomeado = papelAtribuido
    ? 'Já nomeado para este jogo — remova a nomeação antes de trocar de papel'
    : undefined

  const historico =
    candidato.vezesClubeCasa + candidato.vezesClubeFora === 0
      ? 'nunca fez estes clubes'
      : [
          candidato.vezesClubeCasa > 0 ? `casa ${candidato.vezesClubeCasa}×` : null,
          candidato.vezesClubeFora > 0 ? `fora ${candidato.vezesClubeFora}×` : null
        ]
          .filter(Boolean)
          .join(', ')

  return (
    <div
      className={classes('candidato', realcado && 'realcado', !candidato.elegivel && 'bloqueado')}
      onMouseEnter={() => aoRealcar(candidato.delegadoId)}
      onMouseLeave={() => aoRealcar(null)}
    >
      <div className="posicao">{candidato.elegivel ? posicao : '—'}</div>

      <div>
        <div className="nome">
          <span className="mono silencioso">{candidato.numero}</span>
          {candidato.nome}
          <span className={classes('emblema', candidato.nivel === 'ELITE' ? 'elite' : 'principal')}>
            {candidato.nivel === 'ELITE' ? 'Elite' : 'Principal'}
          </span>
          {papelAtribuido && (
            <span className="emblema ok">
              Nomeado · {etiquetaDoPapel(papelAtribuido).replace('Delegado ', '')}
            </span>
          )}
        </div>

        <div className="metricas">
          <span>
            Época <b>{formatarKm(candidato.kmEpoca)}</b>{' '}
            <span style={{ color: acimaDaMedia ? 'var(--aviso)' : 'var(--sucesso)' }}>
              ({acimaDaMedia ? '+' : '−'}
              {formatarKm(Math.abs(candidato.desvioKm))})
            </span>
          </span>
          <span>
            Viagem <b>{formatarKm(candidato.kmViagem)}</b>
            {candidato.minutosViagem != null && ` · ${formatarMinutos(candidato.minutosViagem)}`}
          </span>
          <span>
            Jogos <b>{candidato.jogosEpoca}</b>
          </span>
          <span>{historico}</span>
        </div>

        <div className="barra-km" title={`${formatarKm(candidato.kmEpoca)} acumulados`}>
          <i className={acimaDaMedia ? 'acima' : ''} style={{ width: `${larguraKm}%` }} />
        </div>

        {candidato.bloqueios.map((b, i) => (
          <div key={i} className="nota erro">
            {b.descricao}
          </div>
        ))}
        {candidato.avisos.map((a, i) => (
          <div key={i} className="nota alerta">
            {a}
          </div>
        ))}

        {aberto && (
          <div className="porque">
            {candidato.componentes.map((c) => (
              <div className="linha" key={c.componente}>
                <span className="etiqueta">{c.etiqueta}</span>
                <span>{c.detalhe}</span>
                <span className="valor">{Math.round(c.contributo)}</span>
              </div>
            ))}
            <div className="linha" style={{ borderTop: '1px solid var(--borda)', paddingTop: 4 }}>
              <span className="etiqueta">Total</span>
              <span />
              <span className="valor">
                <b>{candidato.score}</b>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="acoes">
        <button
          type="button"
          className="pontuacao"
          style={{ all: 'unset', cursor: 'pointer' }}
          onClick={() => setAberto(!aberto)}
          title="Ver porquê esta posição"
        >
          <span className="pontuacao">
            <span className="barra">
              <i style={{ width: `${candidato.score}%` }} />
            </span>
            {candidato.score.toFixed(0)}
          </span>
        </button>
        <button
          type="button"
          className="botao pequeno primario"
          onClick={() => aoNomear(candidato.delegadoId, 'PRINCIPAL')}
          disabled={papelAtribuido != null}
          title={jaNomeado}
        >
          Principal
        </button>
        {usaDelegadoAssistente && (
          <button
            type="button"
            className="botao pequeno"
            onClick={() => aoNomear(candidato.delegadoId, 'ASSISTENTE')}
            disabled={papelAtribuido != null}
            title={jaNomeado}
          >
            Assistente
          </button>
        )}
        {/* A sombra vai a aprender; não conta km nem jogos, e são no máximo três. */}
        <button
          type="button"
          className="botao pequeno"
          onClick={() => aoNomear(candidato.delegadoId, 'SOMBRA')}
          disabled={papelAtribuido != null || sombrasCheias}
          title={
            sombrasCheias
              ? `Este jogo já tem ${MAX_SOMBRAS} delegados sombra`
              : jaNomeado || 'Vai a aprender: não conta km nem jogos'
          }
        >
          Sombra
        </button>
      </div>
    </div>
  )
}
