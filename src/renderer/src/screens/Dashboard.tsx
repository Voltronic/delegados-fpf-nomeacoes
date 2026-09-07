import { useEffect, useState } from 'react'
import type { Competicao, LinhaKmDelegado, MatrizDashboard } from '@shared/tipos'
import { classes, formatarKm, formatarMinutos } from '../lib/formato'

export default function Dashboard(): JSX.Element {
  const [epocas, setEpocas] = useState<number[]>([])
  const [seasonId, setSeasonId] = useState<number | ''>('')
  const [km, setKm] = useState<LinhaKmDelegado[]>([])
  const [porCompeticao, setPorCompeticao] = useState<MatrizDashboard | null>(null)
  const [porClube, setPorClube] = useState<MatrizDashboard | null>(null)

  useEffect(() => {
    void window.api.competicoes.listar().then((cs: Competicao[]) => {
      const distintas = [...new Set(cs.map((c) => c.seasonId))].sort((a, b) => b - a)
      setEpocas(distintas)
      setSeasonId((atual) => (atual === '' ? (distintas[0] ?? '') : atual))
    })
  }, [])

  useEffect(() => {
    const epoca = seasonId === '' ? undefined : seasonId
    void window.api.dashboard.km(epoca).then(setKm)
    void window.api.dashboard.porCompeticao(epoca).then(setPorCompeticao)
    void window.api.dashboard.porClube(epoca).then(setPorClube)
  }, [seasonId])

  const kmMaximo = Math.max(1, ...km.map((l) => l.km))
  const totalKm = km.reduce((a, l) => a + l.km, 0)
  const totalJogos = km.reduce((a, l) => a + l.jogos, 0)
  const amplitude = km.length ? Math.max(...km.map((l) => l.km)) - Math.min(...km.map((l) => l.km)) : 0

  function exportarCsv(): void {
    const linhas = [
      ['Numero', 'Nome', 'Nivel', 'Jogos', 'Km', 'Desvio', 'Horas'].join(';'),
      ...km.map((l) =>
        [l.numero, l.nome, l.nivel, l.jogos, l.km, l.desvio, (l.minutos / 60).toFixed(1)].join(';')
      )
    ].join('\n')
    const url = URL.createObjectURL(new Blob([`﻿${linhas}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'km-por-delegado.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="cabecalho-ecra">
        <h1>Dashboard</h1>
        <div style={{ width: 160 }}>
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas as épocas</option>
            {epocas.map((s) => (
              <option key={s} value={s}>
                Época {s}
              </option>
            ))}
          </select>
        </div>
        <div className="subtitulo">
          {totalJogos} nomeações · {formatarKm(totalKm)} no total · amplitude entre delegados{' '}
          <b>{formatarKm(amplitude)}</b>
        </div>
        <div className="espacador" />
        <button className="botao" onClick={exportarCsv} disabled={km.length === 0}>
          Exportar CSV
        </button>
      </div>

      <div className="corpo-ecra">
        <div className="cartao">
          <h2>Quilómetros por delegado</h2>
          {km.length === 0 ? (
            <div className="vazio">Ainda não há nomeações confirmadas.</div>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Nº</th>
                  <th>Delegado</th>
                  <th style={{ width: 90 }}>Nível</th>
                  <th className="num" style={{ width: 70 }}>
                    Jogos
                  </th>
                  <th className="num" style={{ width: 100 }}>
                    Km
                  </th>
                  <th className="num" style={{ width: 110 }}>
                    Desvio
                  </th>
                  <th className="num" style={{ width: 90 }}>
                    Tempo
                  </th>
                  <th style={{ width: '30%' }} />
                </tr>
              </thead>
              <tbody>
                {km.map((l) => (
                  <tr key={l.delegadoId}>
                    <td className="mono silencioso">{l.numero}</td>
                    <td>{l.nome}</td>
                    <td>
                      <span className={classes('emblema', l.nivel === 'ELITE' ? 'elite' : 'principal')}>
                        {l.nivel === 'ELITE' ? 'Elite' : 'Principal'}
                      </span>
                    </td>
                    <td className="num">{l.jogos}</td>
                    <td className="num">{formatarKm(l.km)}</td>
                    <td className="num" style={{ color: l.desvio > 0 ? 'var(--aviso)' : 'var(--sucesso)' }}>
                      {l.desvio > 0 ? '+' : '−'}
                      {formatarKm(Math.abs(l.desvio))}
                    </td>
                    <td className="num silencioso">{formatarMinutos(l.minutos)}</td>
                    <td>
                      <div className="barra-km">
                        <i
                          className={l.desvio > 0 ? 'acima' : ''}
                          style={{ width: `${(l.km / kmMaximo) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Matriz titulo="Jogos por competição" matriz={porCompeticao} />
        <Matriz titulo="Clubes já feitos por delegado" matriz={porClube} />
      </div>
    </>
  )
}

function Matriz({ titulo, matriz }: { titulo: string; matriz: MatrizDashboard | null }): JSX.Element {
  if (!matriz || matriz.colunas.length === 0) {
    return (
      <div className="cartao">
        <h2>{titulo}</h2>
        <div className="vazio">Sem dados ainda.</div>
      </div>
    )
  }
  const valor = (delegadoId: number, chave: string): number =>
    matriz.celulas.find((c) => c.delegadoId === delegadoId && c.chaveColuna === chave)?.valor ?? 0

  return (
    <div className="cartao">
      <h2>{titulo}</h2>
      <div className="envolve-tabela" style={{ maxHeight: 420, border: 'none' }}>
        <table className="tabela">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 2 }}>Delegado</th>
              {matriz.colunas.map((c) => (
                <th key={c.chave} className="num" title={c.etiqueta}>
                  {c.etiqueta.length > 22 ? `${c.etiqueta.slice(0, 20)}…` : c.etiqueta}
                </th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {matriz.linhas.map((l) => {
              const total = matriz.colunas.reduce((a, c) => a + valor(l.delegadoId, c.chave), 0)
              return (
                <tr key={l.delegadoId}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="mono silencioso">{l.numero}</span> {l.nome}
                  </td>
                  {matriz.colunas.map((c) => {
                    const v = valor(l.delegadoId, c.chave)
                    return (
                      <td key={c.chave} className={classes('num', v === 0 ? 'matriz-celula-0' : 'matriz-celula-n')}>
                        {v === 0 ? '·' : v}
                      </td>
                    )
                  })}
                  <td className="num">
                    <b>{total}</b>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
