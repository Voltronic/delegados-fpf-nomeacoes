import { describe, expect, it } from 'vitest'
import {
  dentroDaFolga,
  descreverQuando,
  formatarFolga,
  jogosQueColidem,
  mesmoDia,
  type Folga,
  type JogoAgenda
} from '../src/main/sync/conflitos'

const FOLGA: Folga = { antesMinutos: 270, depoisMinutos: 180 }

const agenda: JogoAgenda[] = [
  { id: 1, dataHora: '2026-09-13T15:00', descricao: 'A × B' },
  { id: 2, dataHora: '2026-09-13T18:30', descricao: 'C × D' },
  { id: 3, dataHora: '2026-09-20T15:00', descricao: 'E × F' },
  { id: 4, dataHora: null, descricao: 'sem data' }
]

describe('folga entre jogos do mesmo delegado', () => {
  it('com um jogo às 15:00, bloqueia depois das 10:30 e antes das 18:00', () => {
    const jogo = '2026-09-13T15:00'
    expect(dentroDaFolga(jogo, '2026-09-13T10:30', FOLGA)).toBe(false)
    expect(dentroDaFolga(jogo, '2026-09-13T10:31', FOLGA)).toBe(true)
    expect(dentroDaFolga(jogo, '2026-09-13T15:00', FOLGA)).toBe(true)
    expect(dentroDaFolga(jogo, '2026-09-13T17:59', FOLGA)).toBe(true)
    expect(dentroDaFolga(jogo, '2026-09-13T18:00', FOLGA)).toBe(false)
  })

  it('não é simétrica: 4h antes bloqueia, 4h depois não', () => {
    expect(dentroDaFolga('2026-09-13T15:00', '2026-09-13T11:00', FOLGA)).toBe(true)
    expect(dentroDaFolga('2026-09-13T15:00', '2026-09-13T19:00', FOLGA)).toBe(false)
  })

  it('apanha jogos dos dois lados da meia-noite', () => {
    expect(dentroDaFolga('2026-09-14T01:00', '2026-09-13T22:00', FOLGA)).toBe(true)
  })

  it('um jogo sem hora conhecida não bloqueia nada', () => {
    expect(dentroDaFolga('2026-09-13T00:00', '2026-09-13T01:00', FOLGA)).toBe(false)
    expect(dentroDaFolga('2026-09-13T01:00', '2026-09-13T00:00', FOLGA)).toBe(false)
  })
})

describe('colisões de agenda', () => {
  it('deteta um jogo adiado para cima de outros no mesmo dia', () => {
    expect(jogosQueColidem(agenda, '2026-09-13T16:00', FOLGA, 99).map((j) => j.id)).toEqual([1, 2])
  })

  it('não acusa colisão fora da folga', () => {
    expect(jogosQueColidem(agenda, '2026-09-13T23:30', FOLGA, 99)).toEqual([])
  })

  it('ignora o próprio jogo', () => {
    expect(jogosQueColidem(agenda, '2026-09-13T16:00', FOLGA, 1).map((j) => j.id)).toEqual([2])
  })

  it('ignora jogos sem data e não rebenta com datas inválidas', () => {
    const enorme = { antesMinutos: 100000, depoisMinutos: 100000 }
    expect(jogosQueColidem(agenda, '2026-09-13T15:00', enorme, 99).some((j) => j.id === 4)).toBe(false)
    expect(jogosQueColidem(agenda, 'não é data', FOLGA, 99)).toEqual([])
    expect(jogosQueColidem([{ id: 5, dataHora: 'lixo', descricao: '' }], '2026-09-13T15:00', FOLGA, 99)).toEqual([])
  })
})

describe('textos dos avisos', () => {
  it('diz quando é o outro jogo', () => {
    expect(descreverQuando('2026-09-13T11:00', '2026-09-13T15:00')).toBe('às 11:00')
    expect(descreverQuando('2026-09-12T23:00', '2026-09-13T01:00')).toBe('em 12/09 às 23:00')
    expect(descreverQuando('2026-09-13T00:00', '2026-09-13T15:00')).toBe('(hora por confirmar)')
  })

  it('compara o dia sem olhar à hora', () => {
    expect(mesmoDia('2026-09-13T23:59', '2026-09-13T00:00')).toBe(true)
    expect(mesmoDia('2026-09-13T23:59', '2026-09-14T00:01')).toBe(false)
  })

  it('escreve a folga como se diz', () => {
    expect(formatarFolga(270)).toBe('4h30')
    expect(formatarFolga(180)).toBe('3h')
    expect(formatarFolga(45)).toBe('45 min')
  })
})
