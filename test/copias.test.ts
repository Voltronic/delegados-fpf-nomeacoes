import { describe, expect, it } from 'vitest'
import {
  copiasAApagar,
  copiasAnteriores,
  copiasPorData,
  nomeDaCopia,
  PADRAO_COPIA,
  PASTA_COPIAS
} from '../src/main/db/copias'

describe('cópias de segurança', () => {
  it('aponta para uma pasta fora da aplicação, com o caminho intacto', () => {
    // Escrito com barras simples, o \b de `\backups` vira um backspace e o caminho
    // deixa de existir. Separar por barras é a forma de o teste dar por isso.
    expect(PASTA_COPIAS.split('\\')).toEqual(['C:', 'Temp', 'delegados-fpf-nomeacoes', 'backups'])
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u001f]/.test(PASTA_COPIAS)).toBe(false)
  })

  it('nomeia a cópia com carimbo ordenável', () => {
    expect(nomeDaCopia(new Date(2026, 8, 8, 9, 5, 3))).toBe('delegados-20260908-090503.db')
    expect(PADRAO_COPIA.test(nomeDaCopia(new Date(2026, 8, 8, 9, 5, 3)))).toBe(true)
  })

  it('ordena da mais recente para a mais antiga', () => {
    const nomes = ['delegados-20260908-090503.db', 'delegados-20260907-235959.db', 'delegados-20260908-120000.db']
    expect(copiasPorData(nomes)[0]).toBe('delegados-20260908-120000.db')
    expect(copiasPorData(nomes).at(-1)).toBe('delegados-20260907-235959.db')
  })

  it('ignora ficheiros que não são cópias', () => {
    expect(copiasPorData(['delegados.db', 'delegados.db-wal', 'notas.txt', 'delegados-20260908-090503.db'])).toEqual([
      'delegados-20260908-090503.db'
    ])
  })

  it('só apaga o que passa do limite, e apaga sempre as mais antigas', () => {
    const nomes = Array.from({ length: 13 }, (_, i) => `delegados-2026090${i % 9}-1200${String(i).padStart(2, '0')}.db`)
    const apagar = copiasAApagar(nomes, 10)
    expect(apagar).toHaveLength(3)
    // nenhuma das que se apagam pode ser mais recente do que as que ficam
    const ficam = copiasPorData(nomes).slice(0, 10)
    for (const velha of apagar) for (const nova of ficam) expect(velha < nova).toBe(true)
  })

  it('não apaga nada enquanto houver espaço', () => {
    expect(copiasAApagar(['delegados-20260908-090503.db'], 10)).toEqual([])
  })
  it('a seguir à cópia do arranque, apaga as anteriores e mais nada', () => {
    const nomes = [
      'delegados-20260912-090000.db',
      'delegados-20260913-230000.db',
      'delegados-20260913-231500.db',
      'delegados.db',
      'notas.txt'
    ]
    expect(copiasAnteriores(nomes, 'delegados-20260913-231500.db').sort()).toEqual([
      'delegados-20260912-090000.db',
      'delegados-20260913-230000.db'
    ])
  })

  it('nunca apaga a cópia que acabou de ser gravada', () => {
    expect(copiasAnteriores(['delegados-20260913-231500.db'], 'delegados-20260913-231500.db')).toEqual([])
  })
})
