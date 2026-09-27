import { describe, expect, it } from 'vitest'
import { ePatrocinioAcrescentado } from '../src/main/fpf/renomeClube'

/**
 * A FPF muda o nome dos clubes a meio da época, acrescentando patrocínios. Como
 * a chave de um jogo inclui os clubes, isso fazia nascer os jogos todos outra
 * vez: o "Ad Fundão" passou a "Ad Fundão / Alambique" e apareceram vinte jogos
 * a dobrar na lista.
 */
describe('nome de clube com patrocínio acrescentado', () => {
  it('reconhece o caso real que deu origem a isto', () => {
    expect(ePatrocinioAcrescentado('Ad Fundão', 'Ad Fundão / Alambique')).toBe(true)
    expect(ePatrocinioAcrescentado('Ad Fundão / Alambique', 'Ad Fundão')).toBe(true)
  })

  it('e outras formas do mesmo clube', () => {
    expect(ePatrocinioAcrescentado('Sporting Cp', 'Sporting Cp Sad')).toBe(true)
    expect(ePatrocinioAcrescentado('Cd Nacional', 'Cd Nacional Sad')).toBe(true)
    expect(ePatrocinioAcrescentado('Académica Coimbra/Oaf', 'Académica Coimbra/Oaf Sduq')).toBe(true)
  })

  // Isto é o que protege o histórico: juntar a equipa principal com a B
  // apagaria jogos e nomeações de delegados diferentes.
  it('nunca confunde a equipa principal com a B', () => {
    expect(ePatrocinioAcrescentado('Fc Famalicão', 'Fc Famalicão "B"')).toBe(false)
    expect(ePatrocinioAcrescentado('Cf Os Belenenses', 'Cf Os Belenenses "B"')).toBe(false)
    expect(ePatrocinioAcrescentado('Cr Leões Porto Salvo', 'Cr Leões Porto Salvo "B"')).toBe(false)
    expect(ePatrocinioAcrescentado('Vitória Sc Sad', 'Vitória Sc Sad II')).toBe(false)
  })

  it('nem clubes diferentes, nem o mesmo nome repetido', () => {
    expect(ePatrocinioAcrescentado('Sl Benfica', 'Fc Porto')).toBe(false)
    expect(ePatrocinioAcrescentado('Ad Fundão', 'Ad Fundão')).toBe(false)
    expect(ePatrocinioAcrescentado('Ad Fundão', 'Ad Fundão  ')).toBe(false)
  })

  it('ignora acentos e pontuação, como o resto da aplicação', () => {
    expect(ePatrocinioAcrescentado('AD FUNDAO', 'Ad Fundão / Alambique')).toBe(true)
  })

  it('não se pronuncia sobre nomes vazios', () => {
    expect(ePatrocinioAcrescentado('', 'Ad Fundão')).toBe(false)
    expect(ePatrocinioAcrescentado('Ad Fundão', '')).toBe(false)
  })
})
