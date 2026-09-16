import { useEffect, useState } from 'react'
import type { Delegado, JogoDetalhado, PapelNomeacao } from '@shared/tipos'
import { etiquetaDoPapel, MAX_SOMBRAS, PAPEIS_UNICOS, sombras } from '@shared/tipos'
import { formatarDataHora, formatarKm } from '../lib/formato'
import { avisar, mensagemDeErro } from '../lib/avisos'

interface Props {
  jogo: JogoDetalhado
  aoFechar: () => void
  aoGuardar: () => void
}

/**
 * Corrigir quem foi a um jogo já realizado.
 *
 * Enganos acontecem — trocar dois nomes parecidos, ou registar quem afinal não
 * foi — e sem forma de os corrigir os quilómetros da época ficam errados para
 * sempre, o que estraga o equilíbrio entre delegados daí em diante. Aqui não há
 * ranking nem sugestões: o jogo já foi, e o que se quer é dizer quem lá esteve.
 *
 * Principal e assistente são um por jogo, por isso escolhem-se numa lista. As
 * sombras são várias e acrescentam-se uma a uma.
 */
export default function CorrigirNomeacao({ jogo, aoFechar, aoGuardar }: Props): JSX.Element {
  const [delegados, setDelegados] = useState<Delegado[]>([])
  const [aGuardar, setAGuardar] = useState(false)

  useEffect(() => {
    void window.api.delegados.listar(true).then(setDelegados)
  }, [])

  const asSombras = sombras(jogo.nomeacoes)

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
        avisar(`${nome} passa a constar como ${etiquetaDoPapel(papel).toLowerCase()}.`)
      }
      aoGuardar()
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    } finally {
      setAGuardar(false)
    }
  }

  /** Nas sombras é preciso dizer qual, porque o jogo pode ter mais do que uma. */
  async function removerSombra(delegadoId: number, nome: string): Promise<void> {
    setAGuardar(true)
    try {
      await window.api.nomeacoes.remover(jogo.id, 'SOMBRA', delegadoId)
      avisar(`${nome} deixa de constar como delegado sombra.`)
      aoGuardar()
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    } finally {
      setAGuardar(false)
    }
  }

  const opcoesDelegados = (excluir: number[]): JSX.Element[] =>
    delegados
      .filter((d) => !excluir.includes(d.id))
      .map((d) => (
        <option key={d.id} value={d.id}>
          {d.numero} — {d.nome}
          {d.ativo ? '' : ' (inativo)'}
        </option>
      ))

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
            {PAPEIS_UNICOS.map((papel) => {
              const atual = jogo.nomeacoes.find((n) => n.papel === papel)
              return (
                <label className="campo" key={papel}>
                  {etiquetaDoPapel(papel)}
                  <select
                    value={atual?.delegadoId ?? ''}
                    disabled={aGuardar}
                    onChange={(e) => definir(papel, e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">— sem delegado —</option>
                    {opcoesDelegados([])}
                  </select>
                  {atual && (
                    <span className="silencioso" style={{ fontWeight: 400 }}>
                      {formatarKm(atual.km)} registados nesta viagem
                    </span>
                  )}
                </label>
              )
            })}

            <div className="campo">
              Delegados sombra ({asSombras.length} de {MAX_SOMBRAS})
              {asSombras.length > 0 && (
                <div className="pilha" style={{ gap: 4 }}>
                  {asSombras.map((n) => (
                    <div className="linha" key={n.id}>
                      <span className="chip-delegado sombra">S {n.delegadoNome}</span>
                      <div className="espacador" style={{ marginLeft: 'auto' }} />
                      <button
                        className="botao pequeno perigo"
                        disabled={aGuardar}
                        onClick={() => removerSombra(n.delegadoId, n.delegadoNome)}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <select
                value=""
                disabled={aGuardar || asSombras.length >= MAX_SOMBRAS}
                onChange={(e) => e.target.value !== '' && definir('SOMBRA', Number(e.target.value))}
              >
                <option value="">
                  {asSombras.length >= MAX_SOMBRAS
                    ? `— já tem ${MAX_SOMBRAS} sombras —`
                    : '— acrescentar delegado sombra —'}
                </option>
                {opcoesDelegados(jogo.nomeacoes.map((n) => n.delegadoId))}
              </select>
              <span className="silencioso" style={{ fontWeight: 400 }}>
                Vão ao jogo a aprender: não contam km nem jogos na época.
              </span>
            </div>
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
