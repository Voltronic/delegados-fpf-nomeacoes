import type { PesoComponente } from '@shared/tipos'

/**
 * Pesos por omissão. A fase 1 privilegia deliberadamente o equilíbrio de km e a
 * rotação de clubes; os restantes componentes existem já implementados mas com
 * peso baixo ou desligados, para se irem ativando sem alterar código.
 */
export const PESOS_POR_OMISSAO: PesoComponente[] = [
  {
    componente: 'equilibrioKm',
    etiqueta: 'Equilíbrio de km',
    descricao: 'Sobe quem tem menos quilómetros acumulados na época.',
    peso: 45,
    ativo: true
  },
  {
    componente: 'novidadeClube',
    etiqueta: 'Rotação de clubes',
    descricao: 'Dá prioridade a quem ainda não fez jogos destes clubes esta época.',
    peso: 35,
    ativo: true
  },
  {
    componente: 'proximidade',
    etiqueta: 'Proximidade ao recinto',
    descricao: 'Favorece quem vive mais perto do recinto, sem impedir deslocações longas.',
    peso: 20,
    ativo: true
  },
  {
    componente: 'custoAviao',
    etiqueta: 'Custo de avião',
    descricao:
      'Penaliza fortemente as deslocações que exigem avião — o voo custa à FPF muito mais do que os km mostram.',
    // Deliberadamente maior do que a soma dos outros pesos ativos (45+35+20):
    // um voo não se compensa com poucos km na época nem com um aeroporto ao
    // lado de casa. Na prática, só se manda alguém de avião quando não há
    // ninguém que possa ir por estrada — que é o que se pretende.
    peso: 120,
    ativo: true
  },
  {
    componente: 'adequacaoNivel',
    etiqueta: 'Adequação do nível',
    descricao: 'Reserva os delegados de elite para os jogos que os exigem.',
    peso: 10,
    ativo: false
  },
  {
    componente: 'equilibrioCompeticao',
    etiqueta: 'Equilíbrio por competição',
    descricao: 'Distribui os jogos de cada competição por todos os delegados.',
    peso: 10,
    ativo: false
  },
  {
    componente: 'descanso',
    etiqueta: 'Descanso',
    descricao: 'Favorece quem está há mais tempo sem ser nomeado.',
    peso: 10,
    ativo: false
  }
]
