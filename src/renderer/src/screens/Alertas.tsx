import { useEffect, useState } from 'react'
import type { Alerta, ProgressoSincronizacao, ResultadoAtualizacao } from '@shared/tipos'
import { classes, formatarDataHora } from '../lib/formato'
import { avisar, guardarCom, mensagemDeErro } from '../lib/avisos'

const ETIQUETAS: Record<Alerta['tipo'], { texto: string; classe: string }> = {
  CONFLITO: { texto: 'Conflito de agenda', classe: 'erro' },
  ALTERADO: { texto: 'Jogo alterado', classe: 'alerta' },
  DESAPARECIDO: { texto: 'Jogo desapareceu', classe: 'alerta' },
  RECINTO_SEM_COORDENADAS: { texto: 'Recinto sem coordenadas', classe: 'alerta' }
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
  // Por omissão mostram-se todos: marcar como lido é dizer "já vi", não "já não
  // interessa". Um alerta só sai da lista quando é apagado.
  const [filtro, setFiltro] = useState<'PORLER' | 'TODOS'>('TODOS')
  const [progresso, setProgresso] = useState<ProgressoSincronizacao | null>(null)

  useEffect(() => {
    void window.api.sync.estado().then(setEstado)
    const largarSync = window.api.sync.aoConcluir((r) => {
      setEstado({ aCorrer: false, ultima: r })
      setProgresso(null)
      // A mensagem do último "Atualizar agora" deixa de valer quando outra
      // atualização termina — por exemplo a nova tentativa que resolveu os erros.
      setMensagem(null)
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
      const semNovidades = r.alertas.length === 0 && r.criados === 0 && r.recintosLocalizados === 0
      const porLer = r.competicoesComErro?.length ?? 0
      const quantasPorLer =
        porLer === 1
          ? '1 competição não foi lida'
          : porLer > 1
            ? `${porLer} competições não foram lidas`
            : 'houve problemas'
      setMensagem(
        // Com erros, "tudo em dia" era falso: há competições que nem se leram.
        r.erros.length
          ? `${semNovidades ? 'Nada foi alterado' : partes.join(', ')}, mas ${quantasPorLer} — ` +
              'a aplicação volta a tentar sozinha dentro de alguns minutos.'
          : semNovidades
            ? 'Já estava tudo em dia — nada foi alterado.'
            : `${partes.join(', ')}.`
      )
    } catch (e) {
      const texto = `A atualização falhou: ${mensagemDeErro(e)}`
      setMensagem(texto)
      avisar(texto, 'erro')
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
          onClick={async () => {
            const lista = await guardarCom(
              () => window.api.alertas.marcarTodosLidos(),
              'Alertas marcados como lidos.'
            )
            if (lista) aoMudar(lista)
          }}
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
            {estado.ultima.erros.length > 3 && ` · e mais ${estado.ultima.erros.length - 3}`}
            <div style={{ marginTop: 4 }}>
              A aplicação volta a tentar sozinha; este aviso desaparece assim que essas competições forem
              lidas.
            </div>
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
                  // Lido perde o destaque, mas continua legível e no sítio: a
                  // barra de cor e o fundo são o que distingue o que falta ver.
                  opacity: a.lido ? 0.72 : 1,
                  background: a.lido ? 'var(--superficie-2)' : undefined,
                  borderLeft: a.lido
                    ? '3px solid var(--borda-forte)'
                    : `3px solid var(--${a.tipo === 'CONFLITO' ? 'perigo' : 'aviso'})`
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
                    onClick={async () => {
                      const lista = await guardarCom(
                        () => window.api.alertas.apagar(a.id),
                        'Alerta apagado.'
                      )
                      if (lista) aoMudar(lista)
                    }}
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
