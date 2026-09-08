import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResultadoImportacaoCsvApi } from '@shared/api'
import type { Competicao, EpocaFpf } from '@shared/tipos'
import { avisar, mensagemDeErro } from '../lib/avisos'

interface Props {
  epocas: EpocaFpf[]
  seasonId: number | null
}

const MODELO = `Competicao;Jornada;Data;Hora;Casa;Fora;Recinto
CAMPEONATO DE PORTUGAL;5;13/09/2026;15:00;Atl. C. Vila Meã;Fc Vinhais;Estadio Municipal Vila Meã
LIGA PLACARD;3;14/09/2026;18:00;Sporting Cp;Sl Benfica;Pavilhão João Rocha`

/**
 * Épocas conhecidas sem depender da FPF — é justamente quando o site falha que
 * esta importação é precisa. Junta as do catálogo (se veio), as das competições
 * já guardadas, e em último caso a época em curso.
 */
function epocaAtual(): EpocaFpf {
  const hoje = new Date()
  const ano = hoje.getMonth() + 1 >= 7 ? hoje.getFullYear() : hoje.getFullYear() - 1
  return {
    // O seasonId da FPF segue a sequência observada ano − 1920 (2026-2027 = 106).
    seasonId: ano - 1920,
    descricao: `${ano}-${ano + 1}`,
    selecionada: true
  }
}

/**
 * Importação por ficheiro. Existe porque nenhuma API pública de futebol cobre
 * futsal nem os nacionais de formação — se o site da FPF falhar, é isto que
 * mantém o coordenador a trabalhar.
 */
export default function ImportarCsv({ epocas, seasonId }: Props): JSX.Element {
  const [guardadas, setGuardadas] = useState<Competicao[]>([])

  useEffect(() => {
    void window.api.competicoes.listar().then(setGuardadas)
  }, [])

  const epocasDisponiveis = useMemo(() => {
    const mapa = new Map<number, string>()
    for (const c of guardadas) {
      if (!mapa.has(c.seasonId) || c.seasonDescricao) {
        mapa.set(c.seasonId, c.seasonDescricao ?? `Época ${c.seasonId}`)
      }
    }
    for (const e of epocas) mapa.set(e.seasonId, e.descricao)
    if (mapa.size === 0) {
      const atual = epocaAtual()
      mapa.set(atual.seasonId, atual.descricao)
    }
    return [...mapa.entries()]
      .map(([sid, descricao]) => ({ seasonId: sid, descricao, selecionada: false }))
      .sort((a, b) => b.seasonId - a.seasonId)
  }, [epocas, guardadas])

  const [resultado, setResultado] = useState<ResultadoImportacaoCsvApi | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aImportar, setAImportar] = useState(false)
  const [epocaEscolhida, setEpocaEscolhida] = useState<number | ''>('')
  const ficheiro = useRef<HTMLInputElement>(null)

  const epoca = epocaEscolhida === '' ? (seasonId ?? epocasDisponiveis[0]?.seasonId ?? null) : epocaEscolhida

  async function importar(texto: string): Promise<void> {
    if (epoca == null) {
      setErro('Escolha a época antes de importar.')
      return
    }
    setAImportar(true)
    setErro(null)
    try {
      const descricao = epocasDisponiveis.find((e) => e.seasonId === epoca)?.descricao ?? ''
      const r = await window.api.jogos.importarCsv(texto, epoca, descricao)
      setResultado(r)
      avisar(`${r.criados} jogos criados, ${r.atualizados} atualizados.`)
    } catch (e) {
      const texto2 = mensagemDeErro(e)
      setErro(texto2)
      avisar(texto2, 'erro')
    } finally {
      setAImportar(false)
    }
  }

  function descarregarModelo(): void {
    const url = URL.createObjectURL(new Blob([`﻿${MODELO}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-jogos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="cartao">
      <h2>Importar jogos de um ficheiro</h2>
      <p className="silencioso" style={{ marginTop: 0 }}>
        Para quando o site da FPF não estiver acessível, ou para competições que ele não tenha. Aceita CSV
        separado por <code>;</code>, <code>,</code> ou tabulação — é o que o Excel exporta.
      </p>

      {erro && <div className="aviso-caixa erro">{erro}</div>}

      <div className="linha-campos" style={{ marginBottom: 10 }}>
        <label className="campo">
          Época
          <select
            value={epoca ?? ''}
            onChange={(e) => setEpocaEscolhida(e.target.value ? Number(e.target.value) : '')}
          >
            {epocasDisponiveis.map((e) => (
              <option key={e.seasonId} value={e.seasonId}>
                {e.descricao}
              </option>
            ))}
          </select>
        </label>
        <div style={{ flex: '2 1 auto' }}>
          <input
            ref={ficheiro}
            type="file"
            accept=".csv,.txt,text/csv"
            disabled={aImportar}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              await importar(await f.text())
              if (ficheiro.current) ficheiro.current.value = ''
            }}
          />
        </div>
        <button className="botao" style={{ flex: '0 0 auto' }} onClick={descarregarModelo}>
          Descarregar modelo
        </button>
      </div>

      <details>
        <summary className="silencioso" style={{ cursor: 'pointer' }}>
          Que colunas são aceites
        </summary>
        <div className="silencioso" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Obrigatórias: <b>Competição</b>, <b>Casa</b> (ou Visitado), <b>Fora</b> (ou Visitante).
          <br />
          Opcionais: <b>Jornada</b>, <b>Data</b> (13/09/2026 ou 2026-09-13), <b>Hora</b>, <b>Recinto</b>.
          <br />
          Colunas a mais são ignoradas sem problema. Competições e clubes que não existam são criados.
        </div>
      </details>

      {aImportar && <div className="vazio">A importar…</div>}

      {resultado && (
        <div style={{ marginTop: 12 }}>
          <div className="linha" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="emblema ok">{resultado.criados} jogos novos</span>
            <span className="emblema neutro">{resultado.atualizados} atualizados</span>
            {resultado.competicoesCriadas.length > 0 && (
              <span className="emblema ok">{resultado.competicoesCriadas.length} competições criadas</span>
            )}
            {resultado.clubesCriados.length > 0 && (
              <span className="emblema ok">{resultado.clubesCriados.length} clubes criados</span>
            )}
            {resultado.erros.length > 0 && (
              <span className="emblema erro">{resultado.erros.length} linhas ignoradas</span>
            )}
          </div>

          {resultado.clubesCriados.length > 0 && (
            <div className="silencioso" style={{ marginBottom: 8 }}>
              Clubes criados: {resultado.clubesCriados.join(', ')}. Confirme os recintos em{' '}
              <b>Clubes e recintos</b>.
            </div>
          )}

          {resultado.colunasIgnoradas.length > 0 && (
            <div className="silencioso" style={{ marginBottom: 8 }}>
              Colunas ignoradas: {resultado.colunasIgnoradas.join(', ')}.
            </div>
          )}

          {resultado.erros.length > 0 && (
            <div className="aviso-caixa alerta">
              <b>Linhas que não foram importadas:</b>
              <ul style={{ margin: '6px 0 0 16px' }}>
                {resultado.erros.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    Linha {e.linha}: {e.mensagem}
                  </li>
                ))}
              </ul>
              {resultado.erros.length > 8 && (
                <div style={{ marginTop: 4 }}>e mais {resultado.erros.length - 8}…</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
