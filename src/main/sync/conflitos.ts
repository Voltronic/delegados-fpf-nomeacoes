import { horaDesconhecida, paraDataLocal } from '../../shared/datas'
import type { ConfiguracaoMotor } from '../../shared/tipos'

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

/**
 * A folga à volta do jogo a nomear, em minutos: nenhum outro jogo do delegado
 * pode começar nos `antesMinutos` antes nem nos `depoisMinutos` depois. Não é
 * simétrica — por omissão, 4h30 antes e 3h depois.
 */
export interface Folga {
  antesMinutos: number
  depoisMinutos: number
}

export function folgaDe(config: Pick<ConfiguracaoMotor, 'folgaAntesMinutos' | 'folgaDepoisMinutos'>): Folga {
  return { antesMinutos: config.folgaAntesMinutos, depoisMinutos: config.folgaDepoisMinutos }
}

/**
 * Se `outro` começa dentro da folga à volta de `jogo`. Os limites contam como
 * livres: com um jogo às 15:00 e 4h30/3h, um jogo às 10:30 ou às 18:00 passa.
 *
 * Um jogo sem hora conhecida (`T00:00`) não colide com nada: a meia-noite não é
 * a hora dele, e bloquear por ela era bloquear às cegas. Fica o aviso de que o
 * delegado já tem jogo nesse dia.
 */
export function dentroDaFolga(jogo: string, outro: string, folga: Folga): boolean {
  if (horaDesconhecida(jogo) || horaDesconhecida(outro)) return false
  const inicio = paraDataLocal(jogo)
  const instante = paraDataLocal(outro)
  if (!inicio || !instante) return false
  const minutos = (instante.getTime() - inicio.getTime()) / 60_000
  return minutos > -folga.antesMinutos && minutos < folga.depoisMinutos
}

/** Os jogos da agenda que caem na folga à volta de `dataHora`, sem contar `excluirId`. */
export function jogosQueColidem(
  agenda: JogoAgenda[],
  dataHora: string,
  folga: Folga,
  excluirId: number
): JogoAgenda[] {
  return agenda.filter(
    (j) => j.id !== excluirId && j.dataHora != null && dentroDaFolga(dataHora, j.dataHora, folga)
  )
}

/** Se duas datas ISO locais são do mesmo dia. */
export function mesmoDia(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10)
}

/**
 * Quando é `outro`, dito a partir de `referencia`: "às 13:00" no mesmo dia,
 * "em 14/09 às 23:00" noutro dia, e "(hora por confirmar)" sem hora conhecida.
 */
export function descreverQuando(outro: string, referencia: string): string {
  const dia = mesmoDia(outro, referencia) ? '' : `em ${outro.slice(8, 10)}/${outro.slice(5, 7)} `
  return horaDesconhecida(outro) || outro.length < 16
    ? `${dia}(hora por confirmar)`
    : `${dia}às ${outro.slice(11, 16)}`
}

/** "4h30", "3h", "45 min". */
export function formatarFolga(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = Math.round(minutos % 60)
  if (!horas) return `${resto} min`
  return resto ? `${horas}h${String(resto).padStart(2, '0')}` : `${horas}h`
}
