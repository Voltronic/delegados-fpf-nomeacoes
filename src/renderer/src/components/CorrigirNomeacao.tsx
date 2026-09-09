import { useEffect, useState } from 'react'
import type { Delegado, JogoDetalhado, PapelNomeacao } from '@shared/tipos'
import { formatarDataHora, formatarKm } from '../lib/formato'
import { avisar, mensagemDeErro } from '../lib/avisos'

interface Props {
  jogo: JogoDetalhado
  aoFechar: () => void
  aoGuardar: () => void
}

const PAPEIS: { papel: PapelNomeacao; etiqueta: string }[] = [
  { papel: 'PRINCIPAL', etiqueta: 'Delegado principal' },
  { papel: 'CAMPO', etiqueta: 'Delegado de campo' }
]

/**
 * Corrigir quem foi a um jogo já realizado.
 *
 * Enganos acontecem — trocar dois nomes parecidos, ou registar quem afinal não
 * foi — e sem forma de os corrigir os quilómetros da época ficam errados para
 * sempre, o que estraga o equilíbrio entre delegados daí em diante. Aqui não há
 * ranking nem sugestões: o jogo já foi, e o que se quer é dizer quem lá esteve.
 */
export default function CorrigirNomeacao({ jogo, aoFechar, aoGuardar }: Props): JSX.Element {
  const [delegados, setDelegados] = useState<Delegado[]>([])
  const [aGuardar, setAGuardar] = useState(false)

  useEffect(() => {
    void window.api.delegados.listar(true).then(setDelegados)
  }, [])

  async function definir(papel: PapelNomeacao, delegadoId: number | null): Promise<void> {
    setAGuardar(true)
    try {
      if (delegadoId == null) {
        await window.api.nomeacoes.remover(jogo.id, papel)
        avisar('Nomeação removida.')
      } else {
        await window.api.nomeacoes.nomear({ jogoId: jogo.id, delegadoId, papel })
        const nome = delegados.find((d) => d.id === delegadoId)?.nome ?? 'Delegado'
        // Os km são recalculados a partir da morada de quem passa a constar.
        avisar(`${nome} passa a constar como ${papel === 'PRINCIPAL' ? 'principal' : 'delegado de campo'}.`)
      }
      aoGuardar()
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    } finally {
      setAGuardar(false)
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" style={{ width: 'min(560px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Corrigir nomeação</h2>
          <span className="silencioso">
            {jogo.clubeCasaNome} × {jogo.clubeForaNome} · {formatarDataHora(jogo.dataHora)}
          </span>
        </header>

        <div className="modal-corpo">
          <div className="pilha">
            {PAPEIS.map(({ papel, etiqueta }) => {
              const atual = jogo.nomeacoes.find((n) => n.papel === papel)
              return (
                <label className="campo" key={papel}>
                  {etiqueta}
                  <select
                    value={atual?.delegadoId ?? ''}
                    disabled={aGuardar}
                    onChange={(e) => definir(papel, e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">— sem delegado —</option>
                    {delegados.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.numero} — {d.nome}
                        {d.ativo ? '' : ' (inativo)'}
                      </option>
                    ))}
                  </select>
                  {atual && (
                    <span className="silencioso" style={{ fontWeight: 400 }}>
                      {formatarKm(atual.km)} registados nesta viagem
                    </span>
                  )}
                </label>
              )
            })}
          </div>

          <div className="aviso-caixa alerta" style={{ marginTop: 12 }}>
            Ao trocar de delegado, os quilómetros desta viagem são recalculados a partir da morada de quem
            passa a constar. É por isso que corrigir aqui importa: os km da época são somados a partir
            destas nomeações.
          </div>
        </div>

        <footer>
          <button className="botao primario" onClick={aoFechar} disabled={aGuardar}>
            Concluído
          </button>
        </footer>
      </div>
    </div>
  )
}
