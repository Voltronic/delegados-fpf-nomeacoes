const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Formata um ISO local (YYYY-MM-DDTHH:mm) sem passar por fusos horários. */
export function formatarDataHora(iso: string | null): string {
  if (!iso) return 'sem data'
  const [data, hora] = iso.split('T')
  const [ano, mes, dia] = data.split('-').map(Number)
  const diaSemana = DIAS[new Date(ano, mes - 1, dia).getDay()]
  const horas = hora?.slice(0, 5)
  return `${diaSemana} ${dia} ${MESES[mes - 1]}${horas && horas !== '00:00' ? ` · ${horas}` : ''}`
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
