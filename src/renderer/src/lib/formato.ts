export { diasAte } from '@shared/datas'

/**
 * Data e hora de um jogo: dia/mês/ano e relógio de 24 horas, em toda a
 * aplicação.
 *
 * Trabalha sobre o ISO local (YYYY-MM-DDTHH:mm) sem passar por fusos horários:
 * a hora gravada é a hora a que se joga, e convertê-la mudava-a.
 *
 * `T00:00` é hora por anunciar — nesse caso mostra-se só o dia, senão parecia
 * que o jogo era à meia-noite.
 */
export function formatarDataHora(iso: string | null): string {
  if (!iso) return 'sem data'
  const [data, hora] = iso.split('T')
  const [ano, mes, dia] = data.split('-')
  const horas = hora?.slice(0, 5)
  return `${dia}/${mes}/${ano}${horas && horas !== '00:00' ? ` ${horas}` : ''}`
}

export function formatarData(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export function formatarKm(km: number | null | undefined, casas = 0): string {
  if (km == null) return '—'
  return `${km.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas })} km`
}

export function formatarMinutos(minutos: number | null | undefined): string {
  if (minutos == null) return '—'
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

export function inicioDaSemana(data: Date): Date {
  const d = new Date(data)
  const diff = (d.getDay() + 6) % 7 // segunda-feira como primeiro dia
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Converte para o formato ISO local usado na base de dados, sem UTC. */
export function paraIsoLocal(data: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}T${p(data.getHours())}:${p(
    data.getMinutes()
  )}`
}

export function paraDataIso(data: Date): string {
  return paraIsoLocal(data).slice(0, 10)
}

export function classes(...valores: (string | false | null | undefined)[]): string {
  return valores.filter(Boolean).join(' ')
}

/**
 * A hora de um instante guardado em ISO (UTC), no relógio de quem está a ver.
 * As atualizações são gravadas com `toISOString()`, ao contrário das datas dos
 * jogos, que são hora local sem fuso.
 */
export function horaCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Se um instante ISO é de hoje, para não repetir a data quando é óbvia. */
export function eHoje(iso: string): boolean {
  const d = new Date(iso)
  const agora = new Date()
  return (
    d.getFullYear() === agora.getFullYear() &&
    d.getMonth() === agora.getMonth() &&
    d.getDate() === agora.getDate()
  )
}
