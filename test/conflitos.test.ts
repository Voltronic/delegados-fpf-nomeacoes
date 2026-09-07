import { describe, expect, it } from 'vitest'
import { jogosQueColidem, type JogoAgenda } from '../src/main/sync/conflitos'

const agenda: JogoAgenda[] = [
  { id: 1, dataHora: '2026-09-13T15:00', descricao: 'A × B' },
  { id: 2, dataHora: '2026-09-13T18:30', descricao: 'C × D' },
  { id: 3, dataHora: '2026-09-20T15:00', descricao: 'E × F' },
  { id: 4, dataHora: null, descricao: 'sem data' }
]

describe('colisões de agenda', () => {
  it('deteta um jogo adiado para cima de outro no mesmo dia', () => {
    const colisoes = jogosQueColidem(agenda, '2026-09-13T16:00', 180, 99)
    expect(colisoes.map((j) => j.id)).toEqual([1, 2])
  })

  it('não acusa colisão fora da margem', () => {
    expect(jogosQueColidem(agenda, '2026-09-13T21:00', 120, 99)).toEqual([])
  })

  it('ignora o próprio jogo', () => {
    // Com margem de 4h, as 15:00 colidem com o jogo 1 (o próprio) e com o 2.
    expect(jogosQueColidem(agenda, '2026-09-13T15:00', 240, 99).map((j) => j.id)).toEqual([1, 2])
    expect(jogosQueColidem(agenda, '2026-09-13T15:00', 240, 1).map((j) => j.id)).toEqual([2])
  })

  it('ignora jogos sem data', () => {
    expect(jogosQueColidem(agenda, '2026-09-13T15:00', 100000, 99).some((j) => j.id === 4)).toBe(false)
  })

  it('é simétrica: tanto apanha antecipações como adiamentos', () => {
    expect(jogosQueColidem(agenda, '2026-09-13T13:30', 180, 99).map((j) => j.id)).toEqual([1])
    expect(jogosQueColidem(agenda, '2026-09-13T16:30', 180, 99).map((j) => j.id)).toEqual([1, 2])
  })

  it('não rebenta com datas inválidas', () => {
    expect(jogosQueColidem(agenda, 'não é data', 180, 99)).toEqual([])
    expect(jogosQueColidem([{ id: 5, dataHora: 'lixo', descricao: '' }], '2026-09-13T15:00', 180, 99)).toEqual([])
  })
})
