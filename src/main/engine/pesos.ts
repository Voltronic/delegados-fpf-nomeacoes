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
