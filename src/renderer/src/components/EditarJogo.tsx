import { useEffect, useState } from 'react'
import type { EdicaoJogo, JogoDetalhado, Recinto } from '@shared/tipos'
import { avisar, mensagemDeErro } from '../lib/avisos'

interface Props {
  jogo: JogoDetalhado
  aoFechar: () => void
  aoGuardar: (jogo: JogoDetalhado) => void
}

/**
 * Correção manual de um jogo: data, hora, recinto e jornada.
 *
 * Existe porque a FPF nem sempre está certa nem atempada — o coordenador sabe
 * pelo telefone que o jogo mudou de campo muito antes de isso aparecer no site.
 * A partir da primeira correção, este jogo deixa de ser atualizado
 * automaticamente: caso contrário a correção desaparecia na hora seguinte.
 */
export default function EditarJogo({ jogo, aoFechar, aoGuardar }: Props): JSX.Element {
  const [recintos, setRecintos] = useState<Recinto[]>([])
  const [data, setData] = useState(jogo.dataHora?.slice(0, 10) ?? '')
  const [hora, setHora] = useState(jogo.dataHora?.slice(11, 16) ?? '')
  const [recintoId, setRecintoId] = useState<number | ''>(jogo.recintoId ?? '')
  const [jornada, setJornada] = useState(jogo.jornada ?? '')
  const [aGuardar, setAGuardar] = useState(false)

  useEffect(() => {
    void window.api.recintos.listar().then(setRecintos)
  }, [])

  async function guardar(): Promise<void> {
    setAGuardar(true)
    try {
      const dados: EdicaoJogo = {
        // Sem data não há hora que valha: o jogo fica por marcar.
        dataHora: data ? `${data}T${hora || '00:00'}` : null,
        recintoId: recintoId === '' ? null : recintoId,
        jornada: jornada.trim() || null
      }
      const atualizado = await window.api.jogos.editar(jogo.id, dados)
      if (atualizado) {
        aoGuardar(atualizado)
        avisar('Jogo corrigido. Deixa de ser atualizado automaticamente.')
      }
      aoFechar()
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    } finally {
      setAGuardar(false)
    }
  }

  async function seguirFpf(): Promise<void> {
    try {
      const atualizado = await window.api.jogos.seguirFpf(jogo.id)
      if (atualizado) aoGuardar(atualizado)
      avisar('Jogo devolvido ao controlo da FPF.')
      aoFechar()
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" style={{ width: 'min(560px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Corrigir jogo</h2>
          <span className="silencioso">
            {jogo.clubeCasaNome} × {jogo.clubeForaNome} · {jogo.competicaoNome}
          </span>
        </header>
        <div className="modal-corpo">

        <div className="linha-campos">
          <label className="campo">
            Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo">
            Hora
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <label className="campo" style={{ width: 90 }}>
            Jornada
            <input value={jornada} onChange={(e) => setJornada(e.target.value)} />
          </label>
        </div>

        <label className="campo" style={{ marginTop: 10 }}>
          Recinto
          <select
            value={recintoId}
            onChange={(e) => setRecintoId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">Sem recinto definido</option>
            {recintos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
                {r.lat == null ? ' (sem coordenadas)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="aviso-caixa alerta" style={{ marginTop: 12 }}>
          Depois de corrigir, este jogo deixa de ser atualizado pela FPF — o que ficar aqui é o que vale.
          As nomeações mantêm-se; se a nova data chocar com outro jogo do mesmo delegado, aparece um alerta.
        </div>

        </div>
        <footer>
          <button className="botao primario" onClick={guardar} disabled={aGuardar}>
            {aGuardar ? 'A guardar…' : 'Guardar'}
          </button>
          <button className="botao" onClick={aoFechar} disabled={aGuardar}>
            Cancelar
          </button>
          <div className="espacador" style={{ marginLeft: 'auto' }} />
          {jogo.editadoManualmente && (
            <button className="botao" onClick={seguirFpf} title="Voltar a aceitar as atualizações da FPF">
              Voltar a seguir a FPF
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
