/**
 * Contas com datas partilhadas entre o processo principal e a interface.
 *
 * As datas dos jogos são texto ISO local (`2026-09-13T15:00`), sem fuso: é o
 * que a FPF publica e o que se guarda. Todas as contas aqui tratam disso como
 * hora local, que é como o coordenador a lê.
 */

/**
 * Dias de calendário até uma data: 0 é hoje, 1 é amanhã, negativo é passado.
 *
 * Conta de meia-noite a meia-noite, e não de horas. Comparar a hora do jogo com
 * o início de hoje dava 17 horas para um jogo hoje às 17:00, que arredondado
 * virava "amanhã" — e sexta-feira aparecia como três dias em vez de dois.
 */
export function diasAte(dataHora: string | null, agora = new Date()): number | null {
  if (!dataHora) return null
  const dia = new Date(dataHora)
  if (Number.isNaN(dia.getTime())) return null
  dia.setHours(0, 0, 0, 0)
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  // `round` e não `floor`: as mudanças para a hora de verão fazem os dias ter
  // 23 ou 25 horas, e sem isto a contagem escorregava um dia nessas semanas.
  return Math.round((dia.getTime() - hoje.getTime()) / 86_400_000)
}
