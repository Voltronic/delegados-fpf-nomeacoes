import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NivelDelegado, NomeacaoExportada } from '@shared/tipos'
import { etiquetaDoPapel } from '@shared/tipos'
import { classes, formatarDataHora, formatarKm, paraIsoLocal } from '../lib/formato'
import { ColunaOrdenavel, useOrdenacao, type Valores } from '../lib/ordenacao'
import { avisar, mensagemDeErro } from '../lib/avisos'

type Grupo = 'TODOS' | NivelDelegado

const GRUPOS: { chave: Grupo; etiqueta: string }[] = [
  { chave: 'TODOS', etiqueta: 'Todos' },
  { chave: 'ELITE', etiqueta: 'Elite' },
  { chave: 'PRINCIPAL', etiqueta: 'Principais' }
]

/** Sem acentos e em minúsculas, para "taca" encontrar "TAÇA". */
const semAcentos = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * As nomeações em tabela, para sair da aplicação.
 *
 * As nomeações feitas aqui vão depois para a plataforma oficial da FPF, e é
 * este o ecrã que as entrega: a lista do que está nomeado de agora em diante,
 * com filtros para recortar o que interessa e um ficheiro para levar.
 */
export default function Exportacao(): JSX.Element {
  // Por omissão, o que está para acontecer: o que já passou está no histórico.
  const [de, setDe] = useState<string>(() => paraIsoLocal(new Date()).slice(0, 16))
  const [ate, setAte] = useState<string>('')
  const [grupo, setGrupo] = useState<Grupo>('TODOS')
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<NomeacaoExportada[]>([])
  const [aCarregar, setACarregar] = useState(true)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      setLinhas(
        await window.api.nomeacoes.listar({
          de: de || undefined,
          ate: ate || undefined,
          nivel: grupo === 'TODOS' ? undefined : grupo
        })
      )
    } catch (erro) {
      avisar(mensagemDeErro(erro), 'erro')
    } finally {
      setACarregar(false)
    }
  }, [de, ate, grupo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // A procura é no ecrã e ignora acentos: encontra "sao joao" em "São João".
  const visiveis = useMemo(() => {
    const palavras = semAcentos(texto).split(/\s+/).filter(Boolean)
    if (!palavras.length) return linhas
    return linhas.filter((l) => {
      const onde = semAcentos(
        `${l.competicaoNome} ${l.clubeCasaNome} ${l.clubeForaNome} ${l.recintoNome ?? ''} ` +
          `${l.delegadoNumero} ${l.delegadoNome} ${etiquetaDoPapel(l.papel)}`
      )
      return palavras.every((p) => onde.includes(p))
    })
  }, [linhas, texto])

  const colunas: Valores<
    NomeacaoExportada,
    'dataHora' | 'competicaoNome' | 'jogo' | 'recintoNome' | 'delegadoNome' | 'papel' | 'km'
  > = useMemo(
    () => ({
      dataHora: (l) => l.dataHora ?? '',
      competicaoNome: (l) => l.competicaoNome,
      jogo: (l) => `${l.clubeCasaNome} ${l.clubeForaNome}`,
      recintoNome: (l) => l.recintoNome ?? '',
      delegadoNome: (l) => l.delegadoNome,
      papel: (l) => l.papel,
      km: (l) => l.km ?? 0
    }),
    []
  )
  const { ordenadas, ordem, alternar } = useOrdenacao(visiveis, colunas, {
    coluna: 'dataHora',
    sentido: 'asc'
  })

  function exportarCsv(): void {
    const cabecalho = [
      'Data',
      'Hora',
      'Competicao',
      'Casa',
      'Fora',
      'Recinto',
      'Numero',
      'Delegado',
      'Nivel',
      'Papel',
      'Km'
    ]
    const linhasCsv = ordenadas.map((l) => [
      l.dataHora?.slice(0, 10) ?? '',
      l.dataHora?.slice(11, 16) ?? '',
      l.competicaoNome,
      l.clubeCasaNome,
      l.clubeForaNome,
      l.recintoNome ?? '',
      l.delegadoNumero,
      l.delegadoNome,
      l.delegadoNivel,
      etiquetaDoPapel(l.papel).replace('Delegado ', ''),
      l.km ?? ''
    ])
    // Ponto e vírgula e BOM: é assim que o Excel português abre o ficheiro
    // direito, com acentos e colunas separadas.
    const csv = [cabecalho, ...linhasCsv]
      .map((linha) => linha.map((c) => String(c).replace(/;/g, ',')).join(';'))
      .join('\n')
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `nomeacoes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    avisar(`${ordenadas.length} ${ordenadas.length === 1 ? 'nomeação exportada' : 'nomeações exportadas'}.`)
  }

  const totalKm = ordenadas.reduce((soma, l) => soma + (l.km ?? 0), 0)
  const delegadosDistintos = new Set(ordenadas.map((l) => l.delegadoId)).size

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Exportação</h1>
        <div className="subtitulo">
          {ordenadas.length} {ordenadas.length === 1 ? 'nomeação' : 'nomeações'} · {delegadosDistintos}{' '}
          {delegadosDistintos === 1 ? 'delegado' : 'delegados'} · {formatarKm(totalKm)}
        </div>
        <div className="espacador" />
        <button className="botao primario" onClick={exportarCsv} disabled={ordenadas.length === 0}>
          Exportar CSV
        </button>
      </div>

      <div className="corpo-ecra">
        <div className="cartao">
          <div className="linha-campos" style={{ marginBottom: 12 }}>
            <label className="campo">
              Delegados
              <div className="grupo-botoes">
                {GRUPOS.map((g) => (
                  <button
                    key={g.chave}
                    className={classes(grupo === g.chave && 'ativo')}
                    onClick={() => setGrupo(g.chave)}
                  >
                    {g.etiqueta}
                  </button>
                ))}
              </div>
            </label>
            <label className="campo">
              De
              <input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="campo">
              Até
              <input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} />
            </label>
            <label className="campo">
              Procurar
              <input
                type="search"
                placeholder="Competição, clube, recinto ou delegado"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </label>
          </div>

          <div className="linha" style={{ marginBottom: 8 }}>
            <button
              className="botao pequeno"
              onClick={() => {
                setDe(paraIsoLocal(new Date()).slice(0, 16))
                setAte('')
                setGrupo('TODOS')
                setTexto('')
              }}
            >
              Daqui para a frente
            </button>
            <button
              className="botao pequeno"
              onClick={() => {
                setDe('')
                setAte('')
              }}
            >
              Época inteira
            </button>
            <span className="silencioso">
              Sem data de fim, entra tudo o que estiver marcado a partir da data de início.
            </span>
          </div>

          {aCarregar ? (
            <div className="vazio">A carregar…</div>
          ) : ordenadas.length === 0 ? (
            <div className="vazio">
              {linhas.length === 0
                ? 'Não há nomeações no período escolhido.'
                : 'Nenhuma nomeação corresponde à procura.'}
            </div>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <ColunaOrdenavel coluna="dataHora" ordem={ordem} alternar={alternar} style={{ width: 140 }}>
                    Data
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="jogo" ordem={ordem} alternar={alternar}>
                    Jogo
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="competicaoNome" ordem={ordem} alternar={alternar}>
                    Competição
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="recintoNome" ordem={ordem} alternar={alternar}>
                    Recinto
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="delegadoNome" ordem={ordem} alternar={alternar}>
                    Delegado
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="papel" ordem={ordem} alternar={alternar} style={{ width: 110 }}>
                    Papel
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    coluna="km"
                    ordem={ordem}
                    alternar={alternar}
                    className="num"
                    style={{ width: 90 }}
                  >
                    Km
                  </ColunaOrdenavel>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((l) => (
                  <tr key={`${l.jogoId}:${l.delegadoId}:${l.papel}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(l.dataHora)}</td>
                    <td>
                      <b>
                        {l.clubeCasaNome} × {l.clubeForaNome}
                      </b>
                    </td>
                    <td className="silencioso">{l.competicaoNome}</td>
                    <td className="silencioso">{l.recintoNome ?? 'por indicar'}</td>
                    <td>
                      <span className="mono silencioso">{l.delegadoNumero}</span> {l.delegadoNome}{' '}
                      <span
                        className={classes('emblema', l.delegadoNivel === 'ELITE' ? 'elite' : 'principal')}
                      >
                        {l.delegadoNivel === 'ELITE' ? 'Elite' : 'Principal'}
                      </span>
                    </td>
                    <td>{etiquetaDoPapel(l.papel).replace('Delegado ', '')}</td>
                    <td className="num">{formatarKm(l.km)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
