import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Epoca, LinhaKmDelegado, LinhaRepeticoes, MatrizDashboard } from '@shared/tipos'
import JogosDoDelegado from '../components/JogosDoDelegado'
import { classes, formatarKm, formatarMinutos } from '../lib/formato'
import { ColunaOrdenavel, useOrdenacao, type Valores } from '../lib/ordenacao'

export default function Dashboard(): JSX.Element {
  const [epocas, setEpocas] = useState<Epoca[]>([])
  const [detalhe, setDetalhe] = useState<LinhaKmDelegado | null>(null)
  const [seasonId, setSeasonId] = useState<number | ''>('')
  const [km, setKm] = useState<LinhaKmDelegado[]>([])
  const [porCompeticao, setPorCompeticao] = useState<MatrizDashboard | null>(null)
  const [repeticoes, setRepeticoes] = useState<LinhaRepeticoes[]>([])

  // As contas são sempre de uma época: abre-se na mais recente, que é onde se
  // trabalha. Numa época nova os contadores começam a zero, porque só somam as
  // nomeações dessa época.
  useEffect(() => {
    void window.api.epocas.listar().then((lista) => {
      setEpocas(lista)
      setSeasonId((atual) => (atual === '' ? (lista[0]?.seasonId ?? '') : atual))
    })
  }, [])

  useEffect(() => {
    const epoca = seasonId === '' ? undefined : seasonId
    void window.api.dashboard.km(epoca).then(setKm)
    void window.api.dashboard.porCompeticao(epoca).then(setPorCompeticao)
    void window.api.dashboard.repeticoesClube(epoca).then(setRepeticoes)
  }, [seasonId])

  const colunasKm: Valores<
    LinhaKmDelegado,
    'numero' | 'nome' | 'nivel' | 'jogos' | 'voos' | 'km' | 'desvio' | 'minutos'
  > =
    useMemo(
      () => ({
        // O número é texto na base de dados mas lê-se como número: sem isto, o
        // 10 vinha antes do 2.
        numero: (l) => Number(l.numero) || l.numero,
        nome: (l) => l.nome,
        nivel: (l) => l.nivel,
        jogos: (l) => l.jogos,
        voos: (l) => l.voos,
        km: (l) => l.km,
        desvio: (l) => l.desvio,
        minutos: (l) => l.minutos
      }),
      []
    )
  const { ordenadas: kmOrdenado, ordem: ordemKm, alternar: alternarKm } = useOrdenacao(km, colunasKm, {
    coluna: 'km',
    sentido: 'desc'
  })

  const kmMaximo = Math.max(1, ...km.map((l) => l.km))
  const totalKm = km.reduce((a, l) => a + l.km, 0)
  const totalJogos = km.reduce((a, l) => a + l.jogos, 0)
  const totalVoos = km.reduce((a, l) => a + l.voos, 0)
  const amplitude = km.length ? Math.max(...km.map((l) => l.km)) - Math.min(...km.map((l) => l.km)) : 0

  function exportarCsv(): void {
    const linhas = [
      ['Numero', 'Nome', 'Nivel', 'Jogos', 'Voos', 'Km', 'Desvio', 'Horas'].join(';'),
      ...km.map((l) =>
        [l.numero, l.nome, l.nivel, l.jogos, l.voos, l.km, l.desvio, (l.minutos / 60).toFixed(1)].join(';')
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
            {epocas.map((e) => (
              <option key={e.seasonId} value={e.seasonId}>
                {e.descricao ?? `Época ${e.seasonId}`}
              </option>
            ))}
          </select>
        </div>
        <div className="subtitulo">
          {totalJogos} nomeações · {formatarKm(totalKm)} no total · amplitude entre delegados{' '}
          <b>{formatarKm(amplitude)}</b>
          {totalVoos > 0 && (
            <>
              {' '}
              · <b>{totalVoos}</b> {totalVoos === 1 ? 'deslocação de avião' : 'deslocações de avião'}
            </>
          )}
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
                  <ColunaOrdenavel coluna="numero" ordem={ordemKm} alternar={alternarKm} style={{ width: 60 }}>
                    Nº
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="nome" ordem={ordemKm} alternar={alternarKm}>
                    Delegado
                  </ColunaOrdenavel>
                  <ColunaOrdenavel coluna="nivel" ordem={ordemKm} alternar={alternarKm} style={{ width: 100 }}>
                    Nível
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    coluna="jogos"
                    ordem={ordemKm}
                    alternar={alternarKm}
                    className="num"
                    style={{ width: 80 }}
                  >
                    Jogos
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    coluna="voos"
                    ordem={ordemKm}
                    alternar={alternarKm}
                    className="num"
                    style={{ width: 80 }}
                  >
                    Voos
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    coluna="km"
                    ordem={ordemKm}
                    alternar={alternarKm}
                    className="num"
                    style={{ width: 110 }}
                  >
                    Km
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    coluna="desvio"
                    ordem={ordemKm}
                    alternar={alternarKm}
                    className="num"
                    style={{ width: 120 }}
                  >
                    Desvio
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    coluna="minutos"
                    ordem={ordemKm}
                    alternar={alternarKm}
                    className="num"
                    style={{ width: 100 }}
                  >
                    Tempo
                  </ColunaOrdenavel>
                  <th style={{ width: '30%' }} />
                </tr>
              </thead>
              <tbody>
                {kmOrdenado.map((l) => (
                  <tr
                    key={l.delegadoId}
                    className="clicavel"
                    title="Ver os jogos e as viagens deste delegado"
                    onClick={() => setDetalhe(l)}
                  >
                    <td className="mono silencioso">{l.numero}</td>
                    <td>{l.nome}</td>
                    <td>
                      <span className={classes('emblema', l.nivel === 'ELITE' ? 'elite' : 'principal')}>
                        {l.nivel === 'ELITE' ? 'Elite' : 'Principal'}
                      </span>
                    </td>
                    <td className="num">{l.jogos}</td>
                    <td className={classes('num', l.voos > 0 && 'com-voos')}>
                      {l.voos === 0 ? '·' : l.voos}
                    </td>
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
        <Repeticoes linhas={repeticoes} />
      </div>

      {detalhe && (
        <JogosDoDelegado
          delegado={detalhe}
          seasonId={seasonId === '' ? undefined : seasonId}
          etiquetaEpoca={
            seasonId === ''
              ? 'Todas as épocas'
              : (epocas.find((e) => e.seasonId === seasonId)?.descricao ?? `Época ${seasonId}`)
          }
          aoFechar={() => setDetalhe(null)}
        />
      )}
    </>
  )
}

function Matriz({ titulo, matriz }: { titulo: string; matriz: MatrizDashboard | null }): JSX.Element {
  // Os hooks têm de correr sempre, mesmo sem dados, por isso a matriz vazia é
  // tratada depois de os declarar.
  const linhas = matriz?.linhas ?? []
  const colunas = matriz?.colunas ?? []
  const celulas = matriz?.celulas ?? []

  const valor = useCallback(
    (delegadoId: number, chave: string): number =>
      celulas.find((c) => c.delegadoId === delegadoId && c.chaveColuna === chave)?.valor ?? 0,
    [celulas]
  )

  // Além do delegado e do total, cada clube (ou competição) é uma coluna
  // ordenável: é assim que se responde a "quem ainda não fez este clube?".
  const valores = useMemo(() => {
    const mapa: Record<string, (l: (typeof linhas)[number]) => string | number> = {
      delegado: (l) => Number(l.numero) || l.numero,
      total: (l) => colunas.reduce((a, c) => a + valor(l.delegadoId, c.chave), 0)
    }
    for (const c of colunas) mapa[c.chave] = (l) => valor(l.delegadoId, c.chave)
    return mapa
  }, [colunas, valor])

  const { ordenadas, ordem, alternar } = useOrdenacao(linhas, valores, {
    coluna: 'delegado',
    sentido: 'asc'
  })

  if (!matriz || colunas.length === 0) {
    return (
      <div className="cartao">
        <h2>{titulo}</h2>
        <div className="vazio">Sem dados ainda.</div>
      </div>
    )
  }

  return (
    <div className="cartao">
      <h2>{titulo}</h2>
      {/*
        Sem altura máxima: o cartão cresce com o número de delegados e quem
        rola é a página. Com um limite fixo, a tabela ficava com um scroll
        próprio dentro de outro, e nunca se via a lista toda de uma vez.
        A rolagem horizontal fica, porque as colunas são tantas quantos os
        clubes da época.
      */}
      <div className="envolve-tabela" style={{ border: 'none', maxHeight: 'none', overflowY: 'visible' }}>
        <table className="tabela">
          <thead>
            <tr>
              <ColunaOrdenavel
                coluna="delegado"
                ordem={ordem}
                alternar={alternar}
                style={{ position: 'sticky', left: 0, zIndex: 2 }}
              >
                Delegado
              </ColunaOrdenavel>
              {colunas.map((c) => (
                <ColunaOrdenavel
                  key={c.chave}
                  coluna={c.chave}
                  ordem={ordem}
                  alternar={alternar}
                  className="num"
                  title={c.etiqueta}
                >
                  {c.etiqueta.length > 22 ? `${c.etiqueta.slice(0, 20)}…` : c.etiqueta}
                </ColunaOrdenavel>
              ))}
              <ColunaOrdenavel coluna="total" ordem={ordem} alternar={alternar} className="num">
                Total
              </ColunaOrdenavel>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => {
              const total = colunas.reduce((a, c) => a + valor(l.delegadoId, c.chave), 0)
              return (
                <tr key={l.delegadoId}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="mono silencioso">{l.numero}</span> {l.nome}
                  </td>
                  {colunas.map((c) => {
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

/**
 * Clubes repetidos por delegado, por número de repetições.
 *
 * Uma coluna por clube ficava ilegível a meio da época — são mais de cem clubes
 * nas competições nacionais, e quase todas as células estariam vazias. Aqui as
 * colunas são o número de vezes (2×, 3×, …) e cada célula diz *quais* os clubes
 * repetidos, que é a pergunta que o coordenador faz de facto.
 *
 * O mesmo clube em competições diferentes não é repetição: são equipas e
 * escalões diferentes.
 */
function Repeticoes({ linhas }: { linhas: LinhaRepeticoes[] }): JSX.Element {
  const maximo = Math.max(2, ...linhas.flatMap((l) => l.repeticoes.map((r) => r.vezes)))
  const colunas = Array.from({ length: maximo - 1 }, (_, i) => i + 2)

  const valores = useMemo(() => {
    const mapa: Record<string, (l: LinhaRepeticoes) => string | number> = {
      delegado: (l) => Number(l.numero) || l.numero,
      total: (l) => l.repeticoes.length
    }
    for (const vezes of colunas) {
      mapa[String(vezes)] = (l) => l.repeticoes.filter((r) => r.vezes === vezes).length
    }
    return mapa
  }, [colunas.join(',')])

  const { ordenadas, ordem, alternar } = useOrdenacao(linhas, valores, {
    coluna: 'delegado',
    sentido: 'asc'
  })

  const comRepeticoes = linhas.filter((l) => l.repeticoes.length > 0).length

  return (
    <div className="cartao">
      <h2>Clubes repetidos por delegado</h2>
      <div className="silencioso" style={{ marginBottom: 10 }}>
        Cada coluna é o número de vezes que o delegado já fez o mesmo clube <b>na mesma competição</b>.
        O mesmo clube em competições diferentes não conta como repetição.{' '}
        {comRepeticoes === 0
          ? 'Ainda ninguém repetiu nenhum clube.'
          : `${comRepeticoes} ${comRepeticoes === 1 ? 'delegado repetiu' : 'delegados repetiram'} pelo menos um clube.`}
      </div>

      {linhas.length === 0 ? (
        <div className="vazio">Sem dados ainda.</div>
      ) : (
        <div className="envolve-tabela" style={{ border: 'none', maxHeight: 'none', overflowY: 'visible' }}>
          <table className="tabela">
            <thead>
              <tr>
                <ColunaOrdenavel
                  coluna="delegado"
                  ordem={ordem}
                  alternar={alternar}
                  style={{ position: 'sticky', left: 0, zIndex: 2, width: 200 }}
                >
                  Delegado
                </ColunaOrdenavel>
                {colunas.map((vezes) => (
                  <ColunaOrdenavel key={vezes} coluna={String(vezes)} ordem={ordem} alternar={alternar}>
                    {vezes}×
                  </ColunaOrdenavel>
                ))}
                <ColunaOrdenavel coluna="total" ordem={ordem} alternar={alternar} className="num">
                  Total
                </ColunaOrdenavel>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l) => (
                <tr key={l.delegadoId}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="mono silencioso">{l.numero}</span> {l.nome}
                  </td>
                  {colunas.map((vezes) => {
                    const doGrupo = l.repeticoes.filter((r) => r.vezes === vezes)
                    return (
                      <td key={vezes} className={doGrupo.length === 0 ? 'matriz-celula-0' : undefined}>
                        {doGrupo.length === 0 ? (
                          '·'
                        ) : (
                          <div className="chips">
                            {doGrupo.map((r) => (
                              <span
                                key={`${r.clubeId}-${r.competicaoId}`}
                                className="chip-delegado"
                                title={`${r.clubeNome} — ${r.competicaoNome} (${r.vezes} vezes)`}
                              >
                                {r.clubeNome}
                                <span className="silencioso"> · {r.competicaoNome}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="num">
                    <b>{l.repeticoes.length}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
