import { describe, expect, it } from 'vitest'
import { diasAte } from '../src/shared/datas'

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
