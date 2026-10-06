import { describe, expect, it } from 'vitest'
import { abreviarCompeticao } from '../src/shared/competicoes'

/**
 * Os nomes são os que vêm mesmo do site da FPF. O que interessa é que o
 * cabeçalho caiba e continue a distinguir a competição: duas colunas com o
 * mesmo texto seriam piores do que nomes compridos.
 */
describe('nome curto de uma competição', () => {
  it('tira o patrocinador e as palavras que todas partilham', () => {
    expect(abreviarCompeticao('LIGA 3 PLACARD')).toBe('Liga 3')
    expect(abreviarCompeticao('CAMPEONATO DE PORTUGAL')).toBe('Portugal')
    expect(abreviarCompeticao('TAÇA DE PORTUGAL GENERALI TRANQUILIDADE')).toBe('Taça Portugal')
    expect(abreviarCompeticao('Supertaça Cândido Oliveira Placard')).toBe('Supertaça')
  })

  it('mantém o que distingue os escalões', () => {
    expect(abreviarCompeticao('CAMPEONATO NACIONAL SUB-15 I DIVISÃO')).toBe('Sub-15 I')
    expect(abreviarCompeticao('CAMPEONATO NACIONAL SUB-15 II DIVISÃO')).toBe('Sub-15 II')
    expect(abreviarCompeticao('CAMPEONATO NACIONAL SUB-17 I DIVISÃO')).toBe('Sub-17 I')
    expect(abreviarCompeticao('CAMPEONATO NACIONAL FEMININO SUB-19 II DIVISÃO')).toBe('Fem. Sub-19 II')
  })

  it('não confunde acrónimos nem numerais com palavras', () => {
    expect(abreviarCompeticao('LIGA BPI')).toBe('Liga BPI')
    expect(abreviarCompeticao('LIGA NEXT GEN')).toBe('Liga Next Gen')
    expect(abreviarCompeticao('Campeonato Nacional Futsal 2.ª Divisão')).toBe('Futsal 2.ª')
  })

  it('cabe sempre, encurtando antes de cortar', () => {
    const nomes = [
      'CAMPEONATO DE PORTUGAL',
      'CAMPEONATO NACIONAL FEMININO SUB-19 II DIVISÃO',
      'CAMPEONATO NACIONAL SUB-15 I DIVISÃO',
      'CAMPEONATO NACIONAL SUB-15 II DIVISÃO',
      'CAMPEONATO NACIONAL SUB-17 I DIVISÃO',
      'CAMPEONATO NACIONAL SUB-19 I DIVISÃO',
      'Campeonato Nacional Futsal 2.ª Divisão',
      'Campeonato Nacional Futsal 3ª Divisão',
      'LIGA 3 PLACARD',
      'LIGA BPI',
      'LIGA FEMININA PLACARD',
      'LIGA FEMININA SUB-17',
      'LIGA FEMININA SUB-19',
      'LIGA NEXT GEN',
      'LIGA PLACARD',
      'SUPERTAÇA DE FUTSAL PLACARD',
      'SUPERTAÇA FEMININA FUTSAL PLACARD',
      'SUPERTAÇA FUTEBOL FEMININO VODAFONE',
      'Supertaça Cândido Oliveira Placard',
      'TAÇA DA LIGA FEMININA PLACARD',
      'TAÇA DE PORTUGAL GENERALI TRANQUILIDADE'
    ]
    const curtos = nomes.map(abreviarCompeticao)
    for (const curto of curtos) {
      expect(curto.length).toBeLessThanOrEqual(18)
      expect(curto.trim()).not.toBe('')
    }
    // E nenhuma coluna fica com o mesmo texto de outra: senão não se saberia
    // qual é qual.
    expect(new Set(curtos).size).toBe(nomes.length)
  })
})
