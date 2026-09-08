import { useEffect, useState } from 'react'
import type { Clube, Competicao, Recinto } from '@shared/tipos'
import { avisar, mensagemDeErro } from '../lib/avisos'

/**
 * Criação de um jogo à mão. Existe para a aplicação nunca ficar bloqueada: se o
 * site da FPF mudar, estiver em baixo ou simplesmente não tiver um jogo, o
 * coordenador continua a poder nomear.
 */
export default function JogoManual(): JSX.Element {
  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [clubes, setClubes] = useState<Clube[]>([])
  const [recintos, setRecintos] = useState<Recinto[]>([])

  const [competicaoId, setCompeticaoId] = useState<number | ''>('')
  const [casaId, setCasaId] = useState<number | ''>('')
  const [foraId, setForaId] = useState<number | ''>('')
  const [recintoId, setRecintoId] = useState<number | ''>('')
  const [dataHora, setDataHora] = useState('')
  const [jornada, setJornada] = useState('')
  const [mensagem, setMensagem] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    void window.api.competicoes.listar().then(setCompeticoes)
    void window.api.clubes.listar().then(setClubes)
    void window.api.recintos.listar().then(setRecintos)
  }, [])

  // Sugere o recinto configurado para o clube da casa, sem impedir a troca.
  useEffect(() => {
    if (casaId === '' || competicaoId === '') return
    void window.api.clubes.recintos(casaId).then((associacoes) => {
      const especifico = associacoes.find((a) => a.competicaoId === competicaoId)
      const omissao = associacoes.find((a) => a.competicaoId === null)
      const escolhido = especifico ?? omissao
      if (escolhido) setRecintoId(escolhido.recintoId)
    })
  }, [casaId, competicaoId])

  async function criar(): Promise<void> {
    if (competicaoId === '' || casaId === '' || foraId === '') {
      setMensagem({ tipo: 'erro', texto: 'Escolha a competição e os dois clubes.' })
      return
    }
    if (casaId === foraId) {
      setMensagem({ tipo: 'erro', texto: 'O clube visitado e o visitante têm de ser diferentes.' })
      return
    }
    try {
      const jogo = await window.api.jogos.criarManual({
        competicaoId,
        clubeCasaId: casaId,
        clubeForaId: foraId,
        recintoId: recintoId === '' ? null : recintoId,
        dataHora: dataHora || null,
        jornada: jornada || null
      })
      if (!jogo) {
        setMensagem({ tipo: 'erro', texto: 'Não foi possível criar o jogo.' })
        return
      }
      setMensagem({
        tipo: 'info',
        texto: `Jogo criado: ${jogo.clubeCasaNome} × ${jogo.clubeForaNome}. Já aparece no ecrã de Nomeações.`
      })
      avisar(`Jogo ${jogo.clubeCasaNome} × ${jogo.clubeForaNome} criado.`)
      setCasaId('')
      setForaId('')
      setRecintoId('')
      setJornada('')
    } catch (e) {
      const texto = mensagemDeErro(e)
      setMensagem({ tipo: 'erro', texto })
      avisar(texto, 'erro')
    }
  }

  return (
    <div className="cartao">
      <h2>Criar um jogo à mão</h2>
      <p className="silencioso" style={{ marginTop: 0 }}>
        Para jogos que não venham da FPF — ou se a importação estiver indisponível.
      </p>

      {mensagem && (
        <div className={`aviso-caixa ${mensagem.tipo === 'erro' ? 'erro' : 'info'}`}>{mensagem.texto}</div>
      )}

      <div className="linha-campos">
        <label className="campo" style={{ flex: '2 1 220px' }}>
          Competição
          <select
            value={competicaoId}
            onChange={(e) => setCompeticaoId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Escolher…</option>
            {competicoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo estreito">
          Jornada
          <input type="text" value={jornada} onChange={(e) => setJornada(e.target.value)} />
        </label>
        <label className="campo">
          Data e hora
          <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
        </label>
      </div>

      <div className="linha-campos" style={{ marginTop: 10 }}>
        <label className="campo">
          Clube visitado
          <select value={casaId} onChange={(e) => setCasaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Escolher…</option>
            {clubes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Clube visitante
          <select value={foraId} onChange={(e) => setForaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Escolher…</option>
            {clubes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Recinto
          <select value={recintoId} onChange={(e) => setRecintoId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Sem recinto</option>
            {recintos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
                {r.lat == null ? ' (sem coordenadas)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="botao" style={{ flex: '0 0 auto' }} onClick={criar}>
          Criar jogo
        </button>
      </div>
    </div>
  )
}
