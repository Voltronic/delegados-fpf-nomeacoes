import { useEffect, useMemo, useState } from 'react'
import type { JogoDetalhado } from '@shared/tipos'
import { classes, formatarDataHora } from '../lib/formato'

interface Props {
  titulo: string
  subtitulo: string
  jogos: JogoDetalhado[]
  /** Texto do botão de confirmar, para `n` jogos escolhidos. */
  textoConfirmar: (n: number) => string
  aFechar: () => void
  aoConfirmar: (jogoIds: number[]) => Promise<void>
}

/** Sem acentos e em minúsculas: "taca" encontra "TAÇA", "sao joao" encontra "São João". */
const semAcentos = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Escolher, de uma vez, que jogos das competições sem delegado fixo levam
 * delegado.
 *
 * Numa semana de Taça são dezenas de jogos, e numa lista embutida no fundo do
 * ecrã era difícil encontrar os que interessam. Aqui há espaço, um filtro por
 * competição e uma procura por competição ou clube, e escolhem-se vários jogos
 * antes de confirmar.
 */
export default function EscolherOutrosJogos({
  titulo,
  subtitulo,
  jogos,
  textoConfirmar,
  aFechar,
  aoConfirmar
}: Props): JSX.Element {
  const [competicaoId, setCompeticaoId] = useState<number | ''>('')
  const [procura, setProcura] = useState('')
  const [escolhidos, setEscolhidos] = useState<Set<number>>(new Set())
  const [aGuardar, setAGuardar] = useState(false)

  // Esc fecha, como em qualquer janela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !aGuardar) aFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aFechar, aGuardar])

  // Só as competições que têm jogos na lista, cada uma com quantos tem.
  const competicoes = useMemo(() => {
    const porId = new Map<number, { id: number; nome: string; jogos: number }>()
    for (const j of jogos) {
      const atual = porId.get(j.competicaoId) ?? { id: j.competicaoId, nome: j.competicaoNome, jogos: 0 }
      atual.jogos++
      porId.set(j.competicaoId, atual)
    }
    return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
  }, [jogos])

  // Cada palavra procurada tem de aparecer na competição ou num dos clubes:
  // "braga taca" encontra os jogos do Braga na Taça.
  const visiveis = useMemo(() => {
    const palavras = semAcentos(procura).split(/\s+/).filter(Boolean)
    return jogos.filter((j) => {
      if (competicaoId !== '' && j.competicaoId !== competicaoId) return false
      if (!palavras.length) return true
      const onde = semAcentos(`${j.competicaoNome} ${j.clubeCasaNome} ${j.clubeForaNome}`)
      return palavras.every((p) => onde.includes(p))
    })
  }, [jogos, competicaoId, procura])

  const alternar = (id: number): void =>
    setEscolhidos((atuais) => {
      const novos = new Set(atuais)
      if (novos.has(id)) novos.delete(id)
      else novos.add(id)
      return novos
    })

  const escolherVisiveis = (): void =>
    setEscolhidos((atuais) => new Set([...atuais, ...visiveis.map((j) => j.id)]))

  // Escolhidos que o filtro atual esconde: continuam escolhidos, e diz-se.
  const foraDoFiltro = [...escolhidos].filter((id) => !visiveis.some((j) => j.id === id)).length

  async function confirmar(): Promise<void> {
    setAGuardar(true)
    try {
      await aoConfirmar([...escolhidos])
    } finally {
      setAGuardar(false)
    }
  }

  return (
    <div className="modal-fundo" onClick={() => !aGuardar && aFechar()}>
      <div
        className="modal escolher-outros-jogos"
        style={{ width: 'min(820px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{titulo}</h2>
          <span className="silencioso">{subtitulo}</span>
        </header>

        <div className="modal-corpo">
          <div className="linha" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <select
              className="campo"
              style={{ maxWidth: 300 }}
              value={competicaoId}
              onChange={(e) => setCompeticaoId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Todas as competições ({jogos.length})</option>
              {competicoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.jogos})
                </option>
              ))}
            </select>
            <input
              className="campo"
              type="search"
              style={{ maxWidth: 260 }}
              placeholder="Procurar competição ou clube"
              value={procura}
              autoFocus
              onChange={(e) => setProcura(e.target.value)}
            />
            <div className="espacador" style={{ marginLeft: 'auto' }} />
            <div className="grupo-botoes">
              <button onClick={escolherVisiveis} disabled={visiveis.length === 0}>
                Selecionar visíveis
              </button>
              <button onClick={() => setEscolhidos(new Set())} disabled={escolhidos.size === 0}>
                Limpar seleção
              </button>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <div className="vazio">
              {jogos.length === 0 ? 'Não há jogos para escolher.' : 'Nenhum jogo corresponde à procura.'}
            </div>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Data</th>
                  <th>Jogo</th>
                  <th>Competição</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((j) => (
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
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(j.dataHora)}</td>
                    <td>
                      <b>
                        {j.clubeCasaNome} × {j.clubeForaNome}
                      </b>
                    </td>
                    <td className="silencioso">{j.competicaoNome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer>
          <button
            className="botao primario"
            disabled={aGuardar || escolhidos.size === 0}
            onClick={() => void confirmar()}
          >
            {aGuardar ? 'A guardar…' : textoConfirmar(escolhidos.size)}
          </button>
          <button className="botao" onClick={aFechar} disabled={aGuardar}>
            Cancelar
          </button>
          {foraDoFiltro > 0 && (
            <span className="silencioso" style={{ marginRight: 'auto' }}>
              {foraDoFiltro} {foraDoFiltro === 1 ? 'escolhido fora' : 'escolhidos fora'} do filtro
            </span>
          )}
        </footer>
      </div>
    </div>
  )
}
