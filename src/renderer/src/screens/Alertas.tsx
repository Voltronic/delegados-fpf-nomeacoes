import { useEffect, useState } from 'react'
import type { Alerta, ProgressoSincronizacao, ResultadoAtualizacao } from '@shared/tipos'
import { classes, formatarDataHora } from '../lib/formato'

const ETIQUETAS: Record<Alerta['tipo'], { texto: string; classe: string }> = {
  CONFLITO: { texto: 'Conflito de agenda', classe: 'erro' },
  ALTERADO: { texto: 'Jogo alterado', classe: 'alerta' },
  DESAPARECIDO: { texto: 'Jogo desapareceu', classe: 'alerta' }
}

interface Props {
  alertas: Alerta[]
  aoMudar: (alertas: Alerta[]) => void
}

export default function Alertas({ alertas, aoMudar }: Props): JSX.Element {
  const [estado, setEstado] = useState<{ aCorrer: boolean; ultima: ResultadoAtualizacao | null }>({
    aCorrer: false,
    ultima: null
  })
  const [aAtualizar, setAAtualizar] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'PORLER' | 'TODOS'>('PORLER')
  const [progresso, setProgresso] = useState<ProgressoSincronizacao | null>(null)

  useEffect(() => {
    void window.api.sync.estado().then(setEstado)
    const largarSync = window.api.sync.aoConcluir((r) => {
      setEstado({ aCorrer: false, ultima: r })
      setProgresso(null)
    })
    const largarProgresso = window.api.fpf.aoProgredir(setProgresso)
    return () => {
      largarSync()
      largarProgresso()
    }
  }, [])

  async function atualizarAgora(): Promise<void> {
    setAAtualizar(true)
    setMensagem(null)
    try {
      const r = await window.api.sync.agora()
      setEstado({ aCorrer: false, ultima: r })
      aoMudar(await window.api.alertas.listar(false))
      const partes = [
        `${r.criados} jogos novos`,
        `${r.atualizados} atualizados`,
        `${r.alertas.length} alertas`
      ]
      if (r.recintosLocalizados > 0) partes.push(`${r.recintosLocalizados} recintos localizados`)
      if (r.recintosPorLocalizar > 0) partes.push(`${r.recintosPorLocalizar} recintos por localizar à mão`)
      setMensagem(
        r.alertas.length === 0 && r.criados === 0 && r.recintosLocalizados === 0
          ? 'Já estava tudo em dia — nada foi alterado.'
          : `${partes.join(', ')}.`
      )
    } catch (e) {
      setMensagem(`A atualização falhou: ${(e as Error).message}`)
    } finally {
      setAAtualizar(false)
      setProgresso(null)
    }
  }

  const visiveis = filtro === 'PORLER' ? alertas.filter((a) => !a.lido) : alertas
  const porLer = alertas.filter((a) => !a.lido).length

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Alertas</h1>
        <div className="subtitulo">
          {porLer > 0 ? `${porLer} por ler` : 'nada por ler'}
          {estado.ultima && ` · última atualização ${new Date(estado.ultima.quando).toLocaleTimeString('pt-PT')}`}
        </div>
        <div className="grupo-botoes">
          <button className={classes(filtro === 'PORLER' && 'ativo')} onClick={() => setFiltro('PORLER')}>
            Por ler
          </button>
          <button className={classes(filtro === 'TODOS' && 'ativo')} onClick={() => setFiltro('TODOS')}>
            Todos
          </button>
        </div>
        <div className="espacador" />
        <button
          className="botao"
          onClick={async () => aoMudar(await window.api.alertas.marcarTodosLidos())}
          disabled={porLer === 0}
        >
          Marcar tudo como lido
        </button>
        <button className="botao primario" onClick={atualizarAgora} disabled={aAtualizar || estado.aCorrer}>
          {aAtualizar || estado.aCorrer ? 'A atualizar…' : 'Atualizar agora'}
        </button>
      </div>

      <div className="corpo-ecra">
        {mensagem && <div className="aviso-caixa info">{mensagem}</div>}

        {progresso && !progresso.concluido && (
          <div style={{ marginBottom: 12 }}>
            <div className="barra-progresso">
              <i style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%` }} />
            </div>
            <div className="silencioso" style={{ marginTop: 4 }}>
              {progresso.etapa} ({progresso.atual}/{progresso.total})
            </div>
          </div>
        )}

        {estado.ultima && estado.ultima.erros.length > 0 && (
          <div className="aviso-caixa erro">
            A última atualização teve problemas: {estado.ultima.erros.slice(0, 3).join(' · ')}
          </div>
        )}

        <div className="silencioso" style={{ marginBottom: 12 }}>
          Os jogos futuros são atualizados no arranque e de hora a hora, e os recintos novos são
          localizados a seguir. Jogos sem alterações não são tocados; o que muda aparece aqui.
        </div>

        {estado.ultima && estado.ultima.recintosPorConfirmar > 0 && (
          <div className="aviso-caixa alerta">
            {estado.ultima.recintosPorConfirmar} recintos foram localizados automaticamente e estão por
            confirmar. Vale a pena vê-los no mapa em <b>Clubes e recintos → Recintos</b> — todos os
            quilómetros dependem destes pontos.
          </div>
        )}

        {visiveis.length === 0 ? (
          <div className="vazio">
            {filtro === 'PORLER' ? 'Nenhum alerta por ler.' : 'Ainda não há alertas.'}
          </div>
        ) : (
          visiveis.map((a) => {
            const etiqueta = ETIQUETAS[a.tipo]
            return (
              <div
                key={a.id}
                className="cartao"
                style={{
                  marginBottom: 10,
                  opacity: a.lido ? 0.62 : 1,
                  borderLeft: `3px solid var(--${a.tipo === 'CONFLITO' ? 'perigo' : 'aviso'})`
                }}
              >
                <div className="linha" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className={`emblema ${etiqueta.classe}`}>{etiqueta.texto}</span>
                  <b>{a.descricao}</b>
                  <span className="silencioso">{formatarDataHora(a.dataHora)}</span>
                  {a.competicao && <span className="silencioso">· {a.competicao}</span>}
                  <div style={{ marginLeft: 'auto' }} />
                  <button
                    className="botao pequeno"
                    onClick={async () => aoMudar(await window.api.alertas.marcarLido(a.id, !a.lido))}
                  >
                    {a.lido ? 'Marcar por ler' : 'Marcar lido'}
                  </button>
                  <button
                    className="botao pequeno perigo"
                    onClick={async () => aoMudar(await window.api.alertas.apagar(a.id))}
                  >
                    Apagar
                  </button>
                </div>
                <div>{a.detalhe}</div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
