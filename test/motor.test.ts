import { describe, expect, it } from 'vitest'
import type { ConfiguracaoMotor, Delegado } from '../src/shared/tipos'
import { avaliarCandidatos } from '../src/main/engine/motor'
import { gerarProposta } from '../src/main/engine/automatico'
import { PESOS_POR_OMISSAO } from '../src/main/engine/pesos'
import type { ContextoJogo, Distancia, EntradaMotor, EstadoDelegado } from '../src/main/engine/tipos'

const CONFIG: ConfiguracaoMotor = {
  pesos: PESOS_POR_OMISSAO,
  distanciaMaximaKm: 0,
  folgaAntesMinutos: 270,
  folgaDepoisMinutos: 180
}

function delegado(id: number, nome: string, extra: Partial<Delegado> = {}): Delegado {
  return {
    id,
    numero: `D${id}`,
    nome,
    morada: 'Rua Exemplo',
    lat: 41 - id * 0.5,
    lng: -8.5,
    nivel: 'PRINCIPAL',
    telefone: null,
    email: null,
    ativo: true,
    notas: null,
    coordsManuais: false,
    ...extra
  }
}

function estado(d: Delegado, extra: Partial<EstadoDelegado> = {}): EstadoDelegado {
  return {
    delegado: d,
    kmEpoca: 0,
    jogosEpoca: 0,
    clubesFeitos: {},
    jogosPorCompeticao: {},
    indisponibilidades: [],
    clubesVetados: [],
    agenda: [],
    ultimaNomeacaoEm: null,
    ...extra
  }
}

const JOGO: ContextoJogo = {
  jogoId: 1,
  dataHora: '2026-09-13T15:00',
  competicaoId: 10,
  competicaoNome: 'Campeonato de Portugal',
  nivelMinimo: null,
  clubeCasaId: 100,
  clubeForaId: 200,
  clubeCasaNome: 'Vila Meã',
  clubeForaNome: 'Vinhais',
  recintoId: 5,
  recintoNome: 'Estádio Municipal',
  recintoLat: 41.2,
  recintoLng: -8.3
}

function entrada(delegados: EstadoDelegado[], distancias: Record<number, number>, over: Partial<EntradaMotor> = {}): EntradaMotor {
  const mapa = new Map<number, Distancia>()
  for (const [id, km] of Object.entries(distancias)) {
    mapa.set(Number(id), { km, minutos: km, fonte: 'OSRM' })
  }
  return {
    jogo: JOGO,
    delegados,
    distancias: mapa,
    config: CONFIG,
    papel: 'PRINCIPAL',
    jaNomeados: [],
    ...over
  }
}

describe('ordenação de candidatos', () => {
  it('põe à frente quem tem menos km acumulados, tudo o resto igual', () => {
    const a = estado(delegado(1, 'Ana'), { kmEpoca: 200 })
    const b = estado(delegado(2, 'Bruno'), { kmEpoca: 1800 })
    const candidatos = avaliarCandidatos(entrada([a, b], { 1: 50, 2: 50 }))
    expect(candidatos[0].nome).toBe('Ana')
    expect(candidatos[0].score).toBeGreaterThan(candidatos[1].score)
  })

  it('penaliza quem já fez os clubes do jogo, sem o excluir', () => {
    const a = estado(delegado(1, 'Ana'), { clubesFeitos: { 100: 2 } })
    const b = estado(delegado(2, 'Bruno'))
    const candidatos = avaliarCandidatos(entrada([a, b], { 1: 50, 2: 50 }))
    expect(candidatos[0].nome).toBe('Bruno')
    expect(candidatos.find((c) => c.nome === 'Ana')!.elegivel).toBe(true)
    expect(candidatos.find((c) => c.nome === 'Ana')!.vezesClubeCasa).toBe(2)
  })

  it('deixa um delegado distante subir quando tem muito menos km', () => {
    const perto = estado(delegado(1, 'Perto'), { kmEpoca: 3000 })
    const longe = estado(delegado(2, 'Longe'), { kmEpoca: 0 })
    const candidatos = avaliarCandidatos(entrada([perto, longe], { 1: 20, 2: 400 }))
    expect(candidatos[0].nome).toBe('Longe')
  })

  /**
   * Um voo custa à FPF muito mais do que os km mostram: numa ida a uma ilha só
   * contam os quilómetros até ao aeroporto, o que faria o jogo parecer barato.
   */
  it('afunda quem tem de vir de uma ilha, mesmo com a viagem mais curta e zero km na época', () => {
    // O jogo é no continente (ver JOGO). Quem vive nos Açores tem 20 km até ao
    // aeroporto, o que pela distância o faria parecer o candidato ideal.
    const daIlha = estado(delegado(1, 'Da Ilha', { lat: 37.747, lng: -25.651 }), { kmEpoca: 0 })
    const doContinente = estado(delegado(2, 'Do Continente', { lat: 41.1, lng: -8.6 }), { kmEpoca: 2000 })
    const distancias = new Map<number, Distancia>([
      [1, { km: 20, minutos: 25, fonte: 'AVIAO' }],
      [2, { km: 300, minutos: 180, fonte: 'OSRM' }]
    ])
    const candidatos = avaliarCandidatos(entrada([daIlha, doContinente], {}, { distancias }))
    expect(candidatos[0].nome).toBe('Do Continente')
    const ilha = candidatos.find((c) => c.nome === 'Da Ilha')!
    expect(ilha.elegivel, 'o avião penaliza, não bloqueia').toBe(true)
    expect(ilha.componentes.find((c) => c.componente === 'custoAviao')!.detalhe).toContain('arquipélago')
  })

  /**
   * Para quem vive nos Açores, ir de São Miguel à Terceira é uma deslocação
   * normal. Penalizá-la deixava os jogos das ilhas sem candidatos naturais.
   */
  it('não penaliza um voo entre ilhas do mesmo arquipélago', () => {
    const jogoNosAcores: ContextoJogo = { ...JOGO, recintoLat: 38.655, recintoLng: -27.216 }
    const outraIlha = estado(delegado(1, 'De São Miguel', { lat: 37.747, lng: -25.651 }))
    const mesmaIlha = estado(delegado(2, 'Da Terceira', { lat: 38.66, lng: -27.22 }))
    const distancias = new Map<number, Distancia>([
      [1, { km: 15, minutos: 20, fonte: 'AVIAO' }],
      [2, { km: 8, minutos: 12, fonte: 'OSRM' }]
    ])
    const candidatos = avaliarCandidatos(
      entrada([outraIlha, mesmaIlha], {}, { distancias, jogo: jogoNosAcores })
    )
    const deSaoMiguel = candidatos.find((c) => c.nome === 'De São Miguel')!
    const componente = deSaoMiguel.componentes.find((c) => c.componente === 'custoAviao')!
    expect(componente.normalizado).toBe(1)
    expect(componente.detalhe).toBe('voo dentro do arquipélago')
  })

  it('a penalização do avião pesa mais do que tudo o resto somado', () => {
    const aviao = PESOS_POR_OMISSAO.find((p) => p.componente === 'custoAviao')!
    const resto = PESOS_POR_OMISSAO.filter((p) => p.ativo && p.componente !== 'custoAviao').reduce(
      (soma, p) => soma + p.peso,
      0
    )
    expect(aviao.ativo).toBe(true)
    // É isto que garante que um voo não se compensa com km baixos mais
    // proximidade ao aeroporto — o caso que fazia a ilha ganhar.
    expect(aviao.peso).toBeGreaterThan(resto)
  })

  it('não penaliza quando não se sabe a distância', () => {
    const a = estado(delegado(1, 'Ana'))
    const [candidato] = avaliarCandidatos(entrada([a], {}))
    const componente = candidato.componentes.find((c) => c.componente === 'custoAviao')!
    expect(componente.normalizado).toBe(1)
  })

  it('calcula km de viagem como ida e volta', () => {
    const a = estado(delegado(1, 'Ana'))
    const [candidato] = avaliarCandidatos(entrada([a], { 1: 120 }))
    expect(candidato.kmViagem).toBe(240)
  })

  it('explica a posição através dos componentes ativos', () => {
    const a = estado(delegado(1, 'Ana'), { kmEpoca: 500 })
    const [candidato] = avaliarCandidatos(entrada([a], { 1: 100 }))
    expect(candidato.componentes.map((c) => c.componente)).toEqual([
      'equilibrioKm',
      'novidadeClube',
      'proximidade',
      'custoAviao'
    ])
    expect(candidato.componentes[1].detalhe).toBe('nunca fez estes clubes')
  })
})

describe('bloqueios rígidos', () => {
  const outros = [estado(delegado(9, 'Controlo'))]

  it('bloqueia por indisponibilidade na data do jogo', () => {
    const a = estado(delegado(1, 'Ana'), {
      indisponibilidades: [{ dataInicio: '2026-09-10', dataFim: '2026-09-20', motivo: 'Férias' }]
    })
    const candidatos = avaliarCandidatos(entrada([a, ...outros], { 1: 50, 9: 50 }))
    const ana = candidatos.find((c) => c.nome === 'Ana')!
    expect(ana.elegivel).toBe(false)
    expect(ana.bloqueios[0]).toMatchObject({ codigo: 'INDISPONIVEL', descricao: 'Indisponível: Férias' })
  })

  it('não bloqueia fora do intervalo de indisponibilidade', () => {
    const a = estado(delegado(1, 'Ana'), {
      indisponibilidades: [{ dataInicio: '2026-10-01', dataFim: '2026-10-05', motivo: null }]
    })
    expect(avaliarCandidatos(entrada([a], { 1: 50 }))[0].elegivel).toBe(true)
  })

  it('bloqueia por veto a qualquer um dos clubes', () => {
    const a = estado(delegado(1, 'Ana'), { clubesVetados: [200] })
    const ana = avaliarCandidatos(entrada([a, ...outros], { 1: 50, 9: 50 })).find((c) => c.nome === 'Ana')!
    expect(ana.bloqueios[0].codigo).toBe('VETO_CLUBE')
    expect(ana.bloqueios[0].descricao).toContain('Vinhais')
  })

  it('bloqueia por conflito de horário dentro da margem', () => {
    const a = estado(delegado(1, 'Ana'), {
      agenda: [{ jogoId: 99, dataHora: '2026-09-13T16:00' }]
    })
    const ana = avaliarCandidatos(entrada([a, ...outros], { 1: 50, 9: 50 })).find((c) => c.nome === 'Ana')!
    expect(ana.bloqueios[0].codigo).toBe('CONFLITO_HORARIO')
  })

  it('não bloqueia um jogo fora da margem de horário', () => {
    const a = estado(delegado(1, 'Ana'), {
      agenda: [{ jogoId: 99, dataHora: '2026-09-13T21:00' }]
    })
    expect(avaliarCandidatos(entrada([a], { 1: 50 }))[0].elegivel).toBe(true)
  })

  it('a folga é de 4h30 antes e 3h depois do jogo a nomear, com os limites livres', () => {
    const as15 = { jogo: { ...JOGO, dataHora: '2026-09-13T15:00' } }
    const elegivelCom = (dataHora: string): boolean =>
      avaliarCandidatos(
        entrada([estado(delegado(1, 'Ana'), { agenda: [{ jogoId: 99, dataHora }] })], { 1: 50 }, as15)
      )[0].elegivel
    expect(elegivelCom('2026-09-13T10:30')).toBe(true)
    expect(elegivelCom('2026-09-13T10:31')).toBe(false)
    expect(elegivelCom('2026-09-13T17:59')).toBe(false)
    expect(elegivelCom('2026-09-13T18:00')).toBe(true)
  })

  it('o bloqueio diz que jogo é e a que horas', () => {
    const a = estado(delegado(1, 'Ana'), {
      agenda: [{ jogoId: 99, dataHora: '2026-09-13T13:00', descricao: 'Fc Porto × Sl Benfica' }]
    })
    const [ana] = avaliarCandidatos(entrada([a], { 1: 50 }, { jogo: { ...JOGO, dataHora: '2026-09-13T15:00' } }))
    expect(ana.bloqueios[0].descricao).toContain('Fc Porto × Sl Benfica às 13:00')
  })

  it('avisa quando o delegado já tem jogo nesse dia, com a hora', () => {
    const a = estado(delegado(1, 'Ana'), {
      agenda: [{ jogoId: 99, dataHora: '2026-09-13T10:00', descricao: 'Fc Porto × Sl Benfica' }]
    })
    const [ana] = avaliarCandidatos(entrada([a], { 1: 50 }, { jogo: { ...JOGO, dataHora: '2026-09-13T15:00' } }))
    expect(ana.elegivel).toBe(true)
    expect(ana.avisos).toContain('Já tem jogo neste dia: Fc Porto × Sl Benfica às 10:00')
  })

  it('não avisa por jogos noutros dias', () => {
    const a = estado(delegado(1, 'Ana'), {
      agenda: [{ jogoId: 99, dataHora: '2026-09-14T10:00', descricao: 'X × Y' }]
    })
    const [ana] = avaliarCandidatos(entrada([a], { 1: 50 }, { jogo: { ...JOGO, dataHora: '2026-09-13T15:00' } }))
    expect(ana.avisos.some((t) => t.startsWith('Já tem jogo neste dia'))).toBe(false)
  })

  it('um jogo sem hora conhecida não bloqueia, mas avisa', () => {
    const a = estado(delegado(1, 'Ana'), {
      agenda: [{ jogoId: 99, dataHora: '2026-09-13T00:00', descricao: 'X × Y' }]
    })
    const [ana] = avaliarCandidatos(entrada([a], { 1: 50 }, { jogo: { ...JOGO, dataHora: '2026-09-13T01:00' } }))
    expect(ana.elegivel).toBe(true)
    expect(ana.avisos).toContain('Já tem jogo neste dia: X × Y (hora por confirmar)')
  })

  it('bloqueia delegado principal em competição de elite', () => {
    const a = estado(delegado(1, 'Ana'))
    const b = estado(delegado(2, 'Bruno', { nivel: 'ELITE' }))
    const candidatos = avaliarCandidatos(
      entrada([a, b], { 1: 50, 2: 50 }, { jogo: { ...JOGO, nivelMinimo: 'ELITE' } })
    )
    expect(candidatos[0].nome).toBe('Bruno')
    expect(candidatos.find((c) => c.nome === 'Ana')!.bloqueios[0].codigo).toBe('NIVEL_INSUFICIENTE')
  })

  it('bloqueia acima do limite de distância quando configurado', () => {
    const a = estado(delegado(1, 'Ana'))
    const candidatos = avaliarCandidatos(
      entrada([a, ...outros], { 1: 400, 9: 50 }, { config: { ...CONFIG, distanciaMaximaKm: 250 } })
    )
    expect(candidatos.find((c) => c.nome === 'Ana')!.bloqueios[0].codigo).toBe('DISTANCIA_EXCESSIVA')
  })

  it('bloqueia quem já está nomeado no outro papel do mesmo jogo', () => {
    const a = estado(delegado(1, 'Ana'))
    const candidatos = avaliarCandidatos(entrada([a, ...outros], { 1: 50, 9: 50 }, { jaNomeados: [1] }))
    expect(candidatos.find((c) => c.nome === 'Ana')!.bloqueios[0].codigo).toBe('JA_NOMEADO')
  })

  it('coloca os bloqueados sempre depois dos elegíveis', () => {
    const bloqueado = estado(delegado(1, 'Bloqueado'), { kmEpoca: 0, clubesVetados: [100] })
    const livre = estado(delegado(2, 'Livre'), { kmEpoca: 5000 })
    const candidatos = avaliarCandidatos(entrada([bloqueado, livre], { 1: 10, 2: 900 }))
    expect(candidatos.map((c) => c.nome)).toEqual(['Livre', 'Bloqueado'])
  })
})

describe('avisos', () => {
  it('avisa quando o delegado não tem coordenadas', () => {
    const a = estado(delegado(1, 'Ana', { lat: null, lng: null }))
    const [candidato] = avaliarCandidatos(entrada([a], {}))
    expect(candidato.elegivel).toBe(true)
    expect(candidato.avisos[0]).toContain('sem morada geocodificada')
  })

  it('avisa quando a distância é apenas estimada', () => {
    const a = estado(delegado(1, 'Ana'))
    const mapa = new Map<number, Distancia>([[1, { km: 100, minutos: null, fonte: 'HAVERSINE' }]])
    const [candidato] = avaliarCandidatos({ ...entrada([a], {}), distancias: mapa })
    expect(candidato.avisos[0]).toContain('linha reta')
  })
})

describe('modo automático', () => {
  function jogoEm(jogoId: number, dataHora: string, casa: number, fora: number): ContextoJogo {
    return { ...JOGO, jogoId, dataHora, clubeCasaId: casa, clubeForaId: fora }
  }

  it('não põe todos os jogos no mesmo delegado', () => {
    const delegados = [1, 2, 3, 4].map((i) => estado(delegado(i, `D${i}`)))
    const distancias = { 1: 100, 2: 100, 3: 100, 4: 100 }
    const jogos = [
      entrada(delegados, distancias, { jogo: jogoEm(1, '2026-09-13T15:00', 100, 200) }),
      entrada(delegados, distancias, { jogo: jogoEm(2, '2026-09-20T15:00', 300, 400) }),
      entrada(delegados, distancias, { jogo: jogoEm(3, '2026-09-27T15:00', 500, 600) }),
      entrada(delegados, distancias, { jogo: jogoEm(4, '2026-10-04T15:00', 700, 800) })
    ]
    const { atribuicoes: proposta } = gerarProposta({ jogos, usaDelegadoAssistente: () => false })
    expect(proposta).toHaveLength(4)
    expect(new Set(proposta.map((p) => p.delegadoId)).size).toBe(4)
  })

  it('atribui os dois papéis a delegados diferentes', () => {
    const delegados = [1, 2, 3].map((i) => estado(delegado(i, `D${i}`)))
    const jogos = [entrada(delegados, { 1: 50, 2: 60, 3: 70 })]
    const { atribuicoes: proposta } = gerarProposta({ jogos, usaDelegadoAssistente: () => true })
    expect(proposta).toHaveLength(2)
    expect(proposta.map((p) => p.papel).sort()).toEqual(['ASSISTENTE', 'PRINCIPAL'])
    expect(proposta[0].delegadoId).not.toBe(proposta[1].delegadoId)
  })

  it('reduz a dispersão de km face a nomear sempre o mais próximo', () => {
    const delegados = [1, 2, 3, 4].map((i) => estado(delegado(i, `D${i}`)))
    const jogos = Array.from({ length: 12 }, (_, i) =>
      entrada(delegados, { 1: 40, 2: 90, 3: 140, 4: 190 }, {
        jogo: jogoEm(i + 1, `2026-09-${String(13 + i).padStart(2, '0')}T15:00`, 100 + i * 10, 200 + i * 10)
      })
    )
    const { atribuicoes: proposta } = gerarProposta({ jogos, usaDelegadoAssistente: () => false })

    const kmPorDelegado = new Map<number, number>()
    for (const p of proposta) kmPorDelegado.set(p.delegadoId, (kmPorDelegado.get(p.delegadoId) ?? 0) + (p.km ?? 0))
    const valores = [...kmPorDelegado.values()]

    expect(proposta).toHaveLength(12)
    expect(kmPorDelegado.size).toBe(4)
    // Sempre-o-mais-próximo daria 12 jogos ao delegado 1 e 0 aos outros.
    expect(Math.max(...valores) - Math.min(...valores)).toBeLessThan(600)
  })

  it('salta os jogos sem candidatos elegíveis em vez de rebentar', () => {
    const bloqueado = estado(delegado(1, 'Ana'), { clubesVetados: [100, 200] })
    const jogos = [entrada([bloqueado], { 1: 50 })]
    const r = gerarProposta({ jogos, usaDelegadoAssistente: () => false })
    expect(r.atribuicoes).toEqual([])
    expect(r.semSugestao).toHaveLength(1)
    expect(r.semSugestao[0].motivos.join(' ')).toContain('veto')
  })

  it('explica cada atribuição', () => {
    const delegados = [1, 2].map((i) => estado(delegado(i, `D${i}`)))
    const { atribuicoes: proposta } = gerarProposta({
      jogos: [entrada(delegados, { 1: 50, 2: 300 })],
      usaDelegadoAssistente: () => false
    })
    expect(proposta[0].motivo).toMatch(/km|clubes/)
  })
})
