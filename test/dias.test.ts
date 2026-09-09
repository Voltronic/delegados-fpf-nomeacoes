import { describe, expect, it } from 'vitest'
import {
  agoraLocal,
  aindaEDeTrabalho,
  dataHoraAGuardar,
  dataMudou,
  diasAte,
  horaDesconhecida,
  HORAS_ATE_HISTORICO,
  limiteDeTrabalho,
  paraDataLocal,
  vaiAcontecer
} from '../src/shared/datas'

/**
 * O caso que falhou em uso real: às 14:57 de 9 de setembro, um jogo desse mesmo
 * dia às 17:00 aparecia como "amanhã", porque se comparava a hora do jogo com a
 * meia-noite de hoje e se arredondava. A contagem é de dias de calendário.
 */
const AGORA = new Date(2026, 8, 9, 14, 57)

describe('dias até um jogo', () => {
  it('um jogo mais logo ainda é hoje', () => {
    expect(diasAte('2026-09-09T17:00', AGORA)).toBe(0)
    expect(diasAte('2026-09-09T23:59', AGORA)).toBe(0)
  })

  it('um jogo já jogado hoje continua a ser hoje', () => {
    expect(diasAte('2026-09-09T09:00', AGORA)).toBe(0)
  })

  it('conta os dias de calendário, não as horas', () => {
    expect(diasAte('2026-09-10T00:30', AGORA)).toBe(1)
    expect(diasAte('2026-09-11T19:30', AGORA)).toBe(2)
    expect(diasAte('2026-09-12T11:00', AGORA)).toBe(3)
    expect(diasAte('2026-09-16T15:00', AGORA)).toBe(7)
  })

  it('o passado é negativo', () => {
    expect(diasAte('2026-09-08T15:00', AGORA)).toBe(-1)
  })

  it('não inventa dias quando não há data', () => {
    expect(diasAte(null, AGORA)).toBeNull()
    expect(diasAte('data inválida', AGORA)).toBeNull()
  })

  it('a mudança da hora de verão não desalinha a contagem', () => {
    // Em 2026 o relógio recua no dia 25 de outubro: essa semana tem um dia de
    // 25 horas, que sem arredondamento dava um dia a menos.
    const antes = new Date(2026, 9, 23, 12, 0)
    expect(diasAte('2026-10-26T15:00', antes)).toBe(3)
  })
})

describe('leitura de datas guardadas', () => {
  it('usa os números tal como estão escritos, sem passar por UTC', () => {
    const d = paraDataLocal('2026-09-13T15:00')!
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 9, 13, 15, 0
    ])
  })

  it('uma data sem hora fica no mesmo dia, em qualquer fuso', () => {
    // `new Date('2026-09-13')` seria meia-noite UTC: nos Açores dava dia 12.
    const d = paraDataLocal('2026-09-13')!
    expect([d.getDate(), d.getMonth() + 1, d.getHours()]).toEqual([13, 9, 0])
  })

  it('e continua a ser hoje quando é hoje', () => {
    expect(diasAte('2026-09-09', new Date(2026, 8, 9, 14, 57))).toBe(0)
  })

  it('devolve nulo para o que não é data', () => {
    expect(paraDataLocal('')).toBeNull()
    expect(paraDataLocal('qualquer coisa')).toBeNull()
  })
})

describe('a hora que a FPF deixa de mostrar', () => {
  it('reconhece a meia-noite como "hora ainda não conhecida"', () => {
    expect(horaDesconhecida('2026-09-09T00:00')).toBe(true)
    expect(horaDesconhecida('2026-09-09T12:00')).toBe(false)
    expect(horaDesconhecida(null)).toBe(false)
  })

  it('não apaga a hora certa quando o jogo é jogado', () => {
    // O caso real: o Santa Clara × Farense das 12:00 passou a 00:00 sozinho,
    // porque a página passa a mostrar o resultado em vez da hora.
    expect(dataHoraAGuardar('2026-09-09T12:00', '2026-09-09T00:00')).toBe('2026-09-09T12:00')
  })

  it('aceita a hora nova quando ela existe', () => {
    expect(dataHoraAGuardar('2026-09-09T12:00', '2026-09-09T17:00')).toBe('2026-09-09T17:00')
  })

  it('aceita a data nova quando o jogo muda mesmo de dia', () => {
    // Mudou de dia e ainda não tem hora: é uma alteração a sério, não um jogo
    // jogado, e a hora antiga já não quer dizer nada.
    expect(dataHoraAGuardar('2026-09-09T12:00', '2026-09-20T00:00')).toBe('2026-09-20T00:00')
  })

  it('não inventa datas onde não há', () => {
    expect(dataHoraAGuardar(null, '2026-09-09T00:00')).toBe('2026-09-09T00:00')
    expect(dataHoraAGuardar('2026-09-09T12:00', null)).toBeNull()
  })
})

describe('avisar o coordenador de uma alteração de data', () => {
  it('não avisa quando a hora só desapareceu do site', () => {
    // O alerta dizia "data passou de 09/09/2026 às 12:00 para 09/09/2026",
    // quando na base de dados a hora ficava exatamente na mesma.
    expect(dataMudou('2026-09-09T12:00', '2026-09-09T00:00')).toBe(false)
  })

  it('avisa quando a hora muda mesmo', () => {
    expect(dataMudou('2026-09-09T12:00', '2026-09-09T17:00')).toBe(true)
  })

  it('avisa quando o jogo é adiado para outro dia', () => {
    expect(dataMudou('2026-09-09T12:00', '2026-09-20T00:00')).toBe(true)
  })

  it('avisa quando um jogo sem data passa a ter data', () => {
    expect(dataMudou(null, '2026-09-09T15:00')).toBe(true)
  })

  it('o que se avisa é sempre o que se grava', () => {
    // A regra tem de ser a mesma nos dois lados: foi por serem duas que o
    // alerta apareceu depois de a gravação já estar corrigida.
    const casos: [string | null, string | null][] = [
      ['2026-09-09T12:00', '2026-09-09T00:00'],
      ['2026-09-09T12:00', '2026-09-09T17:00'],
      ['2026-09-09T12:00', '2026-09-20T00:00'],
      [null, '2026-09-09T15:00'],
      ['2026-09-09T12:00', null]
    ]
    for (const [antes, daFpf] of casos) {
      expect(dataMudou(antes, daFpf), `${antes} → ${daFpf}`).toBe(dataHoraAGuardar(antes, daFpf) !== antes)
    }
  })
})

describe('quando faz sentido avisar sobre um jogo', () => {
  const AGORA = '2026-09-09T14:57'

  it('não avisa sobre um jogo que já começou', () => {
    expect(vaiAcontecer('2026-09-09T12:00', AGORA)).toBe(false)
    expect(vaiAcontecer('2026-09-08T20:00', AGORA)).toBe(false)
  })

  it('avisa sobre o que ainda está para acontecer', () => {
    expect(vaiAcontecer('2026-09-09T17:00', AGORA)).toBe(true)
    expect(vaiAcontecer('2026-09-13T15:00', AGORA)).toBe(true)
  })

  it('um aviso sem data vale sempre', () => {
    // É o caso do recinto sem coordenadas: não está preso a nenhum jogo.
    expect(vaiAcontecer(null, AGORA)).toBe(true)
  })

  it('o instante atual sai no mesmo formato das datas dos jogos', () => {
    expect(agoraLocal(new Date(2026, 8, 9, 9, 5))).toBe('2026-09-09T09:05')
  })
})

describe('quando um jogo passa a histórico', () => {
  const INICIO = '2026-09-09T12:00'

  it('durante o jogo ainda é trabalho', () => {
    // 17h46 de um jogo das 12:00 era o caso real: já devia ser histórico.
    expect(aindaEDeTrabalho(INICIO, new Date(2026, 8, 9, 13, 0))).toBe(true)
    expect(aindaEDeTrabalho(INICIO, new Date(2026, 8, 9, 15, 59))).toBe(true)
  })

  it('quatro horas depois do apito inicial passa a histórico', () => {
    expect(aindaEDeTrabalho(INICIO, new Date(2026, 8, 9, 16, 1))).toBe(false)
    expect(aindaEDeTrabalho(INICIO, new Date(2026, 8, 9, 17, 46))).toBe(false)
  })

  it('um jogo que ainda não começou é sempre trabalho', () => {
    expect(aindaEDeTrabalho('2026-09-13T15:00', new Date(2026, 8, 9, 17, 46))).toBe(true)
  })

  it('um jogo sem data marcada não se perde de vista', () => {
    expect(aindaEDeTrabalho(null, new Date(2026, 8, 9, 17, 46))).toBe(true)
  })

  it('a fronteira é a hora atual menos a duração de um jogo', () => {
    expect(limiteDeTrabalho(new Date(2026, 8, 9, 17, 46))).toBe('2026-09-09T13:46')
    expect(HORAS_ATE_HISTORICO).toBe(4)
  })
})
