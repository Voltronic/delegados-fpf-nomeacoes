import { describe, expect, it } from 'vitest'
import { interpretar, serializar, type DelegadoExportado } from '../src/main/delegados/ficheiro'

const completo: DelegadoExportado = {
  numero: '101',
  nome: 'Ana Ribeiro',
  morada: 'Rua do Norte, Braga',
  lat: 41.55,
  lng: -8.42,
  nivel: 'ELITE',
  telefone: '910000000',
  email: 'ana@exemplo.pt',
  ativo: true,
  notas: 'prefere sábados',
  coordsManuais: true,
  indisponibilidades: [{ dataInicio: '2026-10-01', dataFim: '2026-10-08', motivo: 'férias' }],
  vetos: [{ clube: 'S.C. Braga B', motivo: 'sócio' }]
}

describe('ficheiro de delegados', () => {
  it('sobrevive à ida e volta sem perder nada', () => {
    expect(interpretar(serializar([completo]))).toEqual([completo])
  })

  it('aceita uma lista simples escrita à mão', () => {
    const lidos = interpretar('[{"numero":"7","nome":"João Dias"}]')
    expect(lidos).toHaveLength(1)
    expect(lidos[0]).toMatchObject({ numero: '7', nome: 'João Dias', nivel: 'PRINCIPAL', ativo: true })
    expect(lidos[0].indisponibilidades).toEqual([])
    expect(lidos[0].vetos).toEqual([])
  })

  it('recusa ficheiros que não são delegados', () => {
    expect(() => interpretar('isto não é json')).toThrow(/JSON/)
    expect(() => interpretar('{"formato":"outra-coisa","delegados":[]}')).toThrow(/Formato desconhecido/)
    expect(() => interpretar('{"qualquer":1}')).toThrow(/lista de delegados/)
  })

  it('exige número e nome, e recusa níveis inventados', () => {
    expect(() => interpretar('[{"nome":"Sem número"}]')).toThrow(/obrigatórios/)
    expect(() => interpretar('[{"numero":"9","nome":"X","nivel":"MESTRE"}]')).toThrow(/MESTRE/)
  })

  it('ignora indisponibilidades sem datas e vetos sem clube', () => {
    const lidos = interpretar(
      '[{"numero":"9","nome":"X","indisponibilidades":[{"motivo":"?"}],"vetos":[{"motivo":"?"},{"clube":"Fão"}]}]'
    )
    expect(lidos[0].indisponibilidades).toEqual([])
    expect(lidos[0].vetos).toEqual([{ clube: 'Fão', motivo: null }])
  })

  it('trata campos em branco como ausentes', () => {
    const lidos = interpretar('[{"numero":" 12 ","nome":" Rui ","telefone":"  ","lat":""}]')
    expect(lidos[0]).toMatchObject({ numero: '12', nome: 'Rui', telefone: null, lat: null })
  })
})
