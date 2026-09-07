import { useEffect, useState } from 'react'
import type { Competicao, ConfiguracaoMotor, NivelDelegado } from '@shared/tipos'
import type { InfoAplicacao } from '@shared/api'

export default function Definicoes(): JSX.Element {
  const [config, setConfig] = useState<ConfiguracaoMotor | null>(null)
  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [info, setInfo] = useState<InfoAplicacao | null>(null)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    void window.api.config.motor().then(setConfig)
    void window.api.competicoes.listar().then(setCompeticoes)
    void window.api.app.info().then(setInfo)
  }, [])

  async function guardar(): Promise<void> {
    if (!config) return
    setConfig(await window.api.config.guardarMotor(config))
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  function editarPeso(componente: string, campos: { peso?: number; ativo?: boolean }): void {
    if (!config) return
    setConfig({
      ...config,
      pesos: config.pesos.map((p) => (p.componente === componente ? { ...p, ...campos } : p))
    })
  }

  const somaAtivos = config?.pesos.filter((p) => p.ativo).reduce((a, p) => a + p.peso, 0) ?? 0

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Definições</h1>
        <div className="subtitulo">Como a aplicação ordena os candidatos e onde guarda os dados</div>
        <div className="espacador" />
        {guardado && <span className="emblema ok">Guardado</span>}
        <button className="botao primario" onClick={guardar} disabled={!config}>
          Guardar
        </button>
      </div>

      <div className="corpo-ecra">
        <div className="cartao">
          <h2>Critérios de nomeação</h2>
          <p className="silencioso" style={{ marginTop: 0 }}>
            Cada critério contribui para a pontuação na proporção do seu peso. Comece com poucos critérios
            ativos e vá acrescentando à medida que ganhar confiança nas sugestões.
          </p>
          <table className="tabela">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Ativo</th>
                <th>Critério</th>
                <th style={{ width: 220 }}>Peso</th>
                <th className="num" style={{ width: 90 }}>
                  Influência
                </th>
              </tr>
            </thead>
            <tbody>
              {config?.pesos.map((p) => (
                <tr key={p.componente}>
                  <td>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={p.ativo}
                      onChange={(e) => editarPeso(p.componente, { ativo: e.target.checked })}
                    />
                  </td>
                  <td>
                    <b>{p.etiqueta}</b>
                    <div className="silencioso">{p.descricao}</div>
                  </td>
                  <td>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={p.peso}
                      disabled={!p.ativo}
                      onChange={(e) => editarPeso(p.componente, { peso: Number(e.target.value) })}
                    />
                  </td>
                  <td className="num">
                    {p.ativo && somaAtivos > 0 ? `${Math.round((p.peso / somaAtivos) * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2>Limites</h2>
          <div className="linha-campos">
            <label className="campo">
              Distância máxima por jogo (km, só ida — 0 = sem limite)
              <input
                type="number"
                min={0}
                value={config?.distanciaMaximaKm ?? 0}
                onChange={(e) => config && setConfig({ ...config, distanciaMaximaKm: Number(e.target.value) })}
              />
            </label>
            <label className="campo">
              Folga mínima entre dois jogos do mesmo delegado (minutos)
              <input
                type="number"
                min={0}
                step={30}
                value={config?.margemEntreJogosMinutos ?? 180}
                onChange={(e) =>
                  config && setConfig({ ...config, margemEntreJogosMinutos: Number(e.target.value) })
                }
              />
            </label>
          </div>
        </div>

        <div className="cartao">
          <h2>Competições</h2>
          <p className="silencioso" style={{ marginTop: 0 }}>
            Defina se uma competição exige delegado de elite e se leva delegado de campo além do principal.
          </p>
          <table className="tabela">
            <thead>
              <tr>
                <th>Competição</th>
                <th style={{ width: 90 }}>Época</th>
                <th style={{ width: 170 }}>Nível mínimo</th>
                <th style={{ width: 140 }}>Delegado de campo</th>
                <th style={{ width: 90 }}>Ativa</th>
              </tr>
            </thead>
            <tbody>
              {competicoes.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td className="silencioso mono">{c.seasonId}</td>
                  <td>
                    <select
                      value={c.nivelMinimo ?? ''}
                      onChange={async (e) =>
                        setCompeticoes(
                          await window.api.competicoes.guardar({
                            ...c,
                            nivelMinimo: (e.target.value || null) as NivelDelegado | null
                          })
                        )
                      }
                    >
                      <option value="">Sem exigência</option>
                      <option value="ELITE">Só elite</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={c.usaDelegadoCampo}
                      onChange={async (e) =>
                        setCompeticoes(
                          await window.api.competicoes.guardar({ ...c, usaDelegadoCampo: e.target.checked })
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={c.ativa}
                      onChange={async (e) =>
                        setCompeticoes(await window.api.competicoes.guardar({ ...c, ativa: e.target.checked }))
                      }
                    />
                  </td>
                </tr>
              ))}
              {competicoes.length === 0 && (
                <tr>
                  <td colSpan={5} className="silencioso">
                    Nenhuma competição importada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2>Dados</h2>
          <div className="pilha">
            <div>
              <div className="silencioso">Base de dados</div>
              <code className="mono">{info?.caminhoBaseDados}</code>
            </div>
            <div className="silencioso">
              É gravada uma cópia de segurança (<code>.bak</code>) a cada arranque. Para levar tudo para outro
              computador, copie a pasta inteira da aplicação.
            </div>
            <div className="linha">
              <button className="botao" onClick={() => window.api.app.abrirPastaDados()}>
                Abrir pasta de dados
              </button>
              <span className="silencioso">Versão {info?.versao}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
