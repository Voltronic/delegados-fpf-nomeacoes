import { describe, expect, it } from 'vitest'
import { consultasParaRecinto, simplificarClube, simplificarRecinto } from '../src/main/geo/consultas'

describe('simplificar nomes de recintos', () => {
  it('tira as palavras que só descrevem a instalação', () => {
    expect(simplificarRecinto('Estádio Municipal Marco De Canaveses')).toBe('Marco De Canaveses')
    expect(simplificarRecinto('Complexo Desportivo Castro Daire')).toBe('Castro Daire')
    expect(simplificarRecinto('Campo Quinta Nova, Nº 1')).toBe('Quinta Nova')
    expect(simplificarRecinto('Benfica Campus - Campo Nº1')).toBe('Benfica')
  })

  it('não fica vazio quando o nome é só a instalação', () => {
    expect(simplificarRecinto('Estadio Nacional')).toBe('Nacional')
  })
})

describe('simplificar nomes de clubes', () => {
  it('tira siglas e sufixos societários, deixando o topónimo', () => {
    expect(simplificarClube('Ad Marco 09 Sad')).toBe('Marco')
    expect(simplificarClube('Cdc Montalegre')).toBe('Montalegre')
    expect(simplificarClube('Sc Vianense Sad')).toBe('Vianense')
    expect(simplificarClube('Fc Paços Ferreira Sduq')).toBe('Pacos Ferreira')
    expect(simplificarClube('Vitória Sc Sad "B"')).toBe('Vitoria')
  })
})

describe('lista de consultas', () => {
  it('começa pela morada quando existe', () => {
    const c = consultasParaRecinto('Campo Da Mata', 'Rua X, Caldas da Rainha', ['Caldas Sc'])
    expect(c[0]).toMatchObject({ termo: 'Rua X, Caldas da Rainha, Portugal', origem: 'MORADA', fiavel: true })
  })

  it('tenta o nome antes do clube', () => {
    const c = consultasParaRecinto('Estádio Municipal Marco De Canaveses', null, ['Ad Marco 09 Sad'])
    expect(c.map((x) => x.origem)).toEqual(['NOME', 'NOME_SIMPLIFICADO', 'CLUBE', 'CLUBE_SIMPLIFICADO'])
    expect(c[0].termo).toBe('Estádio Municipal Marco De Canaveses, Portugal')
  })

  it('não repete uma pesquisa a que o nome do recinto já chegou', () => {
    // "Estádio Municipal Fafe" simplifica para "Fafe", e "Ad Fafe Sad" também.
    const c = consultasParaRecinto('Estádio Municipal Fafe', null, ['Ad Fafe Sad'])
    expect(c.map((x) => x.termo)).toEqual([
      'Estádio Municipal Fafe, Portugal',
      'Fafe, Portugal',
      'Ad Fafe Sad, Portugal'
    ])
  })

  it('recorre ao clube para recintos com nome de pessoa', () => {
    const c = consultasParaRecinto('Estádio Carlos Osório', null, ['Ud Oliveirense Sad'])
    expect(c.some((x) => x.termo === 'Oliveirense, Portugal')).toBe(true)
  })

  it('marca como pouco fiáveis as tentativas que não são o nome nem a morada', () => {
    const c = consultasParaRecinto('Campo Estrela', null, ['Lgc Sad'])
    expect(c.filter((x) => x.fiavel).map((x) => x.origem)).toEqual(['NOME'])
  })

  it('usa todos os clubes que jogam no recinto', () => {
    const c = consultasParaRecinto('Estadio Algarve', null, ['Louletano Dc', 'Sc Farense Sad'])
    expect(c.some((x) => x.termo.includes('Louletano'))).toBe(true)
    expect(c.some((x) => x.termo.includes('Farense'))).toBe(true)
  })

  it('não repete termos', () => {
    const c = consultasParaRecinto('Fafe', null, ['Fafe', 'Fafe'])
    expect(c).toHaveLength(1)
  })

  it('ignora termos curtos de mais para significarem alguma coisa', () => {
    expect(consultasParaRecinto('Sc', null, ['Sc'])).toEqual([])
  })
})
