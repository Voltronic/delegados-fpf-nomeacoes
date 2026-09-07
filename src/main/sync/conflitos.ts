/**
 * Deteção de colisões de agenda, isolada da base de dados para ser testável.
 *
 * Um jogo adiado ou antecipado pode cair em cima de outro jogo do mesmo
 * delegado — e ninguém está em dois recintos ao mesmo tempo.
 */
export interface JogoAgenda {
  id: number
  dataHora: string | null
  descricao: string
}

export function jogosQueColidem(
  agenda: JogoAgenda[],
  dataHora: string,
  margemMinutos: number,
  excluirId: number
): JogoAgenda[] {
  const instante = new Date(dataHora).getTime()
  if (Number.isNaN(instante)) return []
  const margemMs = margemMinutos * 60_000

  return agenda.filter((j) => {
    if (j.id === excluirId || !j.dataHora) return false
    const outro = new Date(j.dataHora).getTime()
    if (Number.isNaN(outro)) return false
    return Math.abs(outro - instante) < margemMs
  })
}
