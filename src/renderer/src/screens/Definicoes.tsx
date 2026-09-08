import { useEffect, useState } from 'react'
import type { Competicao, ConfiguracaoMotor, NivelDelegado } from '@shared/tipos'
import type { CopiaSegurancaApi, InfoAplicacao } from '@shared/api'
import { guardarCom } from '../lib/avisos'

export default function Definicoes(): JSX.Element {
  const [config, setConfig] = useState<ConfiguracaoMotor | null>(null)
  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [info, setInfo] = useState<InfoAplicacao | null>(null)
  const [copias, setCopias] = useState<CopiaSegurancaApi[]>([])
  const [guardado, setGuardado] = useState(false)
  const [syncAutomatico, setSyncAutomatico] = useState(true)

  useEffect(() => {
    void window.api.config.motor().then(setConfig)
    void window.api.competicoes.listar().then(setCompeticoes)
    void window.api.app.info().then(setInfo)
    void window.api.app.copias().then(setCopias)
    void window.api.config.ler('sync.automatico').then((v) => setSyncAutomatico(v !== 'false'))
  }, [])

  async function guardar(): Promise<void> {
    if (!config) return
    const actualizada = await guardarCom(
      () => window.api.config.guardarMotor(config),
      'Definições guardadas.'
    )
    if (!actualizada) return
    setConfig(actualizada)
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
          <h2>Atualização automática</h2>
          <p className="silencioso" style={{ marginTop: 0 }}>
            Os jogos futuros das competições ativas são relidos no arranque e depois de hora a hora.
            Jogos sem alterações não são tocados; o que mudar aparece em <b>Alertas</b>.
          </p>
          <label className="linha" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={syncAutomatico}
              onChange={async (e) => {
                setSyncAutomatico(e.target.checked)
                await guardarCom(
                  () => window.api.config.escrever('sync.automatico', String(e.target.checked)),
                  e.target.checked ? 'Atualização automática ligada.' : 'Atualização automática desligada.'
                )
              }}
            />
            Manter os jogos atualizados automaticamente
          </label>
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
                  <td className="silencioso">{c.seasonDescricao ?? `Época ${c.seasonId}`}</td>
                  <td>
                    <select
                      value={c.nivelMinimo ?? ''}
                      onChange={async (e) =>
                        {
                          const lista = await guardarCom(
                            () =>
                              window.api.competicoes.guardar({
                                ...c,
                                nivelMinimo: (e.target.value || null) as NivelDelegado | null
                              }),
                            `${c.nome}: nível guardado.`
                          )
                          if (lista) setCompeticoes(lista)
                        }
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
                        {
                          const lista = await guardarCom(
                            () => window.api.competicoes.guardar({ ...c, usaDelegadoCampo: e.target.checked }),
                            `${c.nome}: delegado de campo guardado.`
                          )
                          if (lista) setCompeticoes(lista)
                        }
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={c.ativa}
                      onChange={async (e) =>
                        {
                          const lista = await guardarCom(
                            () => window.api.competicoes.guardar({ ...c, ativa: e.target.checked }),
                            `${c.nome}: ${e.target.checked ? 'ativada' : 'desativada'}.`
                          )
                          if (lista) setCompeticoes(lista)
                        }
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
            <div>
              <div className="silencioso">Esquema da base de dados</div>
              <span>
                versão {info?.versaoEsquema}
                {info && info.versaoEsquema < info.versaoEsquemaConhecida && (
                  <> · por atualizar para {info.versaoEsquemaConhecida}</>
                )}
              </span>
              <div className="silencioso">
                Ao instalar uma versão nova da aplicação por cima desta pasta, as alterações à base de dados
                são aplicadas sozinhas no arranque — não é preciso recomeçar nem substituir o ficheiro.
              </div>
            </div>
            <div>
              <div className="silencioso">Cópias de segurança</div>
              <code className="mono">{info?.pastaCopias}</code>
            </div>
            <div className="silencioso">
              É gravada uma cópia a cada arranque, antes de qualquer alteração, e guardam-se as 10 mais
              recentes. Ficam fora da pasta da aplicação de propósito: essa pasta é substituída a cada versão
              nova, e uma cópia lá dentro desaparecia com ela. Para repor, feche a aplicação e substitua o
              ficheiro da base de dados pela cópia escolhida.
            </div>
            {copias.length > 0 && (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Cópia</th>
                    <th className="num">Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {copias.map((copia) => (
                    <tr key={copia.ficheiro}>
                      <td className="mono">{copia.ficheiro}</td>
                      <td className="num">{Math.max(1, Math.round(copia.bytes / 1024))} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="linha">
              <button className="botao" onClick={() => window.api.app.abrirPastaDados()}>
                Abrir pasta de dados
              </button>
              <button className="botao" onClick={() => window.api.app.abrirPastaCopias()}>
                Abrir pasta de cópias
              </button>
              <button
                className="botao"
                onClick={async () => {
                  const lista = await guardarCom(() => window.api.app.criarCopia(), 'Cópia de segurança criada.')
                  if (lista) setCopias(lista)
                }}
              >
                Criar cópia agora
              </button>
              <span className="silencioso">Versão {info?.versao}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
