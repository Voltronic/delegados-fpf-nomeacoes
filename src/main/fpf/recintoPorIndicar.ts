import { normalizarNome } from './html'

/**
 * A FPF preenche o campo do recinto com um marcador quando o local ainda não
 * está decidido — "Recinto A Indicar". Não é o nome de um campo: é a ausência
 * de campo.
 *
 * Sem esta deteção criava-se um recinto com esse nome, partilhado por jogos de
 * pontos diferentes do país, e a geocodificação ainda lhe dava coordenadas —
 * no caso real, os Açores. Todas as distâncias desses jogos ficavam erradas.
 */
const MARCADORES = [
  'recinto a indicar',
  'a indicar',
  'por indicar',
  'recinto a designar',
  'a designar',
  'por designar',
  'recinto a definir',
  'a definir',
  'por definir',
  'sem recinto',
  'nao definido',
  'n d'
]

export function eRecintoPorIndicar(nome: string | null | undefined): boolean {
  if (!nome) return true
  const normalizado = normalizarNome(nome)
  if (!normalizado) return true
  return MARCADORES.includes(normalizado)
}
