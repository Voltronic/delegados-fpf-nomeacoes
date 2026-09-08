import { describe, expect, it } from 'vitest'
import { RECINTOS_CONHECIDOS, recintoConhecido } from '../src/main/geo/recintosConhecidos'
import { eRecintoPorIndicar } from '../src/main/fpf/recintoPorIndicar'

/**
 * Os nomes à esquerda são exatamente os que estão gravados na base de dados do
 * coordenador, tal como vieram da FPF. Se um deixar de casar, o recinto deixa
 * silenciosamente de ser localizado — daí o teste.
 */
const NOMES_REAIS: [string, string][] = [
  ['Campo Nº. 2 Compl. Desp. Prof.Jose Gameiro Sousa Gomes', 'Fazendas de Almeirim'],
  ['Pavilhao Do Leões Porto Salvo', 'Oeiras'],
  ["Pavilhão Do Grupo Nun'álvares", 'Guimarães'],
  ['Campo Da Mata', 'Caldas da Rainha'],
  ['Complexo Desportivo Laranjeiras', 'Ponta Delgada'],
  ['Estadio Dois Irmaos', 'Lagoa'],
  ['Campo N.º 1 Centro De Treinos Estádio Cidade De Barcelos', 'Barcelos'],
  ['Complexo Desportivo C.F. Fão', 'Esposende'],
  ['Benfica Campus - Campo Nº1', 'Seixal']
]

describe('recintos com localização confirmada', () => {
  it.each(NOMES_REAIS)('encontra "%s"', (nome, localidade) => {
    const c = recintoConhecido(nome)
    expect(c, `sem localização para "${nome}"`).toBeDefined()
    expect(c!.descricao).toContain(localidade)
  })

  it('tolera diferenças de acentos e maiúsculas', () => {
    expect(recintoConhecido('CAMPO DA MATA')).toBeDefined()
    expect(recintoConhecido('complexo desportivo c.f. fao')).toBeDefined()
    expect(recintoConhecido('Pavilhao do Grupo Nun Alvares')).toBeDefined()
  })

  it('a comparação exige as mesmas palavras, não só parecidas', () => {
    // "C.F." e "CF" separam-se de forma diferente; é aceitável porque o que
    // conta é casar com o nome tal como a FPF o escreve.
    expect(recintoConhecido('Complexo Desportivo CF Fao')).toBeUndefined()
  })

  it('não confunde recintos diferentes com nome parecido', () => {
    // Há dois "Laranjeiras": o complexo é em Ponta Delgada, o estádio municipal
    // é do Paredes. Cada um tem de ficar no seu sítio.
    const acores = recintoConhecido('Complexo Desportivo Laranjeiras')!
    const paredes = recintoConhecido('Estádio Municipal Laranjeiras')!
    expect(acores.lng).toBeLessThan(-25)
    expect(paredes.lng).toBeGreaterThan(-9)
    expect(paredes.lat).toBeGreaterThan(41)
  })

  it('não tem nomes repetidos', () => {
    const nomes = RECINTOS_CONHECIDOS.map((r) => r.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
  })

  it('traz os recintos das competições nacionais todos localizados', () => {
    expect(RECINTOS_CONHECIDOS.length).toBeGreaterThanOrEqual(90)
    for (const r of RECINTOS_CONHECIDOS) {
      expect(r.nome.trim(), 'nome vazio').not.toBe('')
      expect(Number.isFinite(r.lat) && Number.isFinite(r.lng), r.nome).toBe(true)
    }
  })

  it('as coordenadas caem dentro de Portugal, incluindo ilhas', () => {
    for (const c of RECINTOS_CONHECIDOS) {
      expect(c.lat, c.nome).toBeGreaterThan(32)
      expect(c.lat, c.nome).toBeLessThan(42.2)
      expect(c.lng, c.nome).toBeGreaterThan(-31.5)
      expect(c.lng, c.nome).toBeLessThan(-6)
    }
  })
})

describe('recintos por indicar', () => {
  it('reconhece o marcador que a FPF usa quando o local não está decidido', () => {
    expect(eRecintoPorIndicar('Recinto A Indicar')).toBe(true)
    expect(eRecintoPorIndicar('RECINTO A INDICAR')).toBe(true)
    expect(eRecintoPorIndicar('A Designar')).toBe(true)
    expect(eRecintoPorIndicar('Sem recinto')).toBe(true)
  })

  it('trata a ausência de texto como sem recinto', () => {
    expect(eRecintoPorIndicar(null)).toBe(true)
    expect(eRecintoPorIndicar('')).toBe(true)
    expect(eRecintoPorIndicar('   ')).toBe(true)
  })

  it('não confunde recintos verdadeiros com o marcador', () => {
    expect(eRecintoPorIndicar('Estádio Municipal de Vila Meã')).toBe(false)
    expect(eRecintoPorIndicar('Campo da Mata')).toBe(false)
    // Um recinto que por acaso tenha "indicar" no nome continua a ser recinto.
    expect(eRecintoPorIndicar('Campo do Indicador')).toBe(false)
  })
})
