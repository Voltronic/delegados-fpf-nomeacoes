import { describe, expect, it } from 'vitest'
import type { ResultadoAtualizacao } from '../src/shared/tipos'
import { competicoesATentar, esperaAteNovaTentativa } from '../src/main/sync/tentativas'

const resultado = (extra: Partial<ResultadoAtualizacao>): ResultadoAtualizacao => ({
  quando: '2026-09-14T10:10:31.822Z',
  criados: 0,
  atualizados: 0,
  alertas: [],
  erros: [],
  recintosLocalizados: 0,
  recintosPorLocalizar: 0,
  recintosPorConfirmar: 0,
  ...extra
})

describe('nova tentativa depois de uma atualização com erros', () => {
  it('sem erros, não há nada a voltar a tentar', () => {
    expect(competicoesATentar(resultado({ competicoesComErro: [] }))).toBeNull()
  })

  it('volta a tentar só as competições que não foram lidas', () => {
    const r = resultado({
      erros: ['LIGA BPI: não foi possível ler a estrutura da competição.'],
      competicoesComErro: [214, 1, 4]
    })
    expect(competicoesATentar(r)).toEqual([214, 1, 4])
  })

  it('se não se sabe quais falharam, volta a tentar todas', () => {
    expect(competicoesATentar(resultado({ erros: ['sem rede'] }))).toBe('todas')
    expect(competicoesATentar(resultado({ erros: ['sem rede'], competicoesComErro: [] }))).toBe('todas')
  })

  it('tenta aos 5, 10 e 20 minutos, e depois deixa para a hora seguinte', () => {
    expect([0, 1, 2].map(esperaAteNovaTentativa)).toEqual([5 * 60_000, 10 * 60_000, 20 * 60_000])
    expect(esperaAteNovaTentativa(3)).toBeNull()
  })
})
