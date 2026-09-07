import { describe, expect, it } from 'vitest'
import { detetarSeparador, dividirLinha, lerCsv, lerDataHora } from '../src/main/fpf/csv'

describe('separador e campos', () => {
  it('deteta ponto e vírgula, vírgula e tabulação', () => {
    expect(detetarSeparador('a;b;c')).toBe(';')
    expect(detetarSeparador('a,b,c')).toBe(',')
    expect(detetarSeparador('a\tb\tc')).toBe('\t')
  })

  it('respeita aspas e vírgulas dentro dos nomes dos clubes', () => {
    expect(dividirLinha('CP;5;"Cascais, Sad";"Sc Braga ""B"""', ';')).toEqual([
      'CP',
      '5',
      'Cascais, Sad',
      'Sc Braga "B"'
    ])
  })
})

describe('datas', () => {
  it('aceita o formato português', () => {
    expect(lerDataHora('13/09/2026', '15:00')).toBe('2026-09-13T15:00')
    expect(lerDataHora('3-9-2026', '9:30')).toBe('2026-09-03T09:30')
  })

  it('aceita ISO', () => {
    expect(lerDataHora('2026-09-13', '15:00')).toBe('2026-09-13T15:00')
  })

  it('lê a hora da própria célula da data', () => {
    expect(lerDataHora('13/09/2026 20:45', '')).toBe('2026-09-13T20:45')
  })

  it('assume meia-noite sem hora, e nada sem data', () => {
    expect(lerDataHora('13/09/2026', '')).toBe('2026-09-13T00:00')
    expect(lerDataHora('', '15:00')).toBeNull()
    expect(lerDataHora('logo se vê', '')).toBeNull()
  })
})

describe('leitura do ficheiro', () => {
  const cabecalho = 'Competicao;Jornada;Data;Hora;Casa;Fora;Recinto'

  it('lê um ficheiro válido', () => {
    const r = lerCsv(
      [cabecalho, 'CAMP. PORTUGAL;5;13/09/2026;15:00;Atl. C. Vila Meã;Fc Vinhais;Estadio Vila Meã'].join('\n')
    )
    expect(r.erros).toEqual([])
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0]).toMatchObject({
      competicao: 'CAMP. PORTUGAL',
      jornada: '5',
      dataHora: '2026-09-13T15:00',
      clubeCasa: 'Atl. C. Vila Meã',
      clubeFora: 'Fc Vinhais',
      recinto: 'Estadio Vila Meã'
    })
  })

  it('aceita cabeçalhos alternativos e sem acentos', () => {
    const r = lerCsv('prova,round,date,time,visitado,visitante,estadio\nTaça,1,2026-09-19,14:00,A,B,Campo X')
    expect(r.erros).toEqual([])
    expect(r.linhas[0]).toMatchObject({ competicao: 'Taça', jornada: '1', clubeCasa: 'A', clubeFora: 'B' })
  })

  it('engole o BOM que o Excel escreve', () => {
    const r = lerCsv(`﻿${cabecalho}\nCP;1;13/09/2026;15:00;A;B;X`)
    expect(r.erros).toEqual([])
    expect(r.linhas).toHaveLength(1)
  })

  it('diz que colunas obrigatórias faltam', () => {
    const r = lerCsv('Data;Hora\n13/09/2026;15:00')
    expect(r.linhas).toEqual([])
    expect(r.erros[0].mensagem).toContain('Faltam colunas obrigatórias')
  })

  it('reporta a linha exata de cada problema e continua', () => {
    const r = lerCsv(
      [cabecalho, 'CP;1;13/09/2026;15:00;A;B;X', 'CP;2;;;;;', 'CP;3;data má;;C;D;', 'CP;4;14/09/2026;16:00;E;F;Y'].join(
        '\n'
      )
    )
    expect(r.linhas.map((l) => l.linha)).toEqual([2, 5])
    expect(r.erros.map((e) => e.linha)).toEqual([3, 4])
    expect(r.erros[1].mensagem).toContain('Data não reconhecida')
  })

  it('recusa um jogo de um clube contra si próprio', () => {
    const r = lerCsv([cabecalho, 'CP;1;13/09/2026;15:00;Benfica;benfica;X'].join('\n'))
    expect(r.linhas).toEqual([])
    expect(r.erros[0].mensagem).toContain('o mesmo')
  })

  it('aceita jogos sem data marcada', () => {
    const r = lerCsv([cabecalho, 'CP;1;;;A;B;X'].join('\n'))
    expect(r.erros).toEqual([])
    expect(r.linhas[0].dataHora).toBeNull()
  })

  it('assinala as colunas que ignorou', () => {
    const r = lerCsv('Competicao;Casa;Fora;Arbitro\nCP;A;B;Fulano')
    expect(r.colunasIgnoradas).toEqual(['arbitro'])
    expect(r.linhas).toHaveLength(1)
  })
})
