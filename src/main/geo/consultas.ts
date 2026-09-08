/**
 * Constrói as pesquisas a fazer para encontrar um recinto.
 *
 * Os nomes que vêm da FPF dividem-se em três famílias, e só uma delas se
 * encontra pelo nome:
 *  - com o local lá dentro — "Estádio Municipal Marco De Canaveses";
 *  - com nome de pessoa — "Estádio Carlos Osório", que não diz onde fica;
 *  - genéricos — "Campo Da Mata".
 *
 * Para os dois últimos casos, o que localiza é o clube da casa. Daí esta lista
 * de tentativas, da mais fiável para a mais especulativa.
 */

export type OrigemCoordenadas =
  | 'MORADA'
  | 'NOME'
  | 'NOME_SIMPLIFICADO'
  | 'CLUBE'
  | 'CLUBE_SIMPLIFICADO'
  | 'MANUAL'

export interface Consulta {
  termo: string
  origem: OrigemCoordenadas
  /** Falso quando o resultado merece ser conferido antes de se confiar nele. */
  fiavel: boolean
}

/** Palavras que descrevem o tipo de instalação e não ajudam a localizar. */
const PALAVRAS_INSTALACAO = [
  'estadio',
  'estádio',
  'est',
  'campo',
  'complexo',
  'desportivo',
  'parque',
  'jogos',
  'pavilhao',
  'pavilhão',
  'municipal',
  'campus',
  'relvado',
  'sintetico',
  'sintético',
  'anexo',
  'n',
  'no',
  'nº'
]

/** Prefixos e sufixos de nomes de clubes que não são o topónimo. */
const RUIDO_CLUBE = [
  'sad',
  'sduq',
  'sdq',
  'b',
  'fc',
  'sc',
  'cd',
  'ad',
  'gd',
  'ud',
  'cf',
  'ac',
  'sl',
  'cp',
  'scu',
  'usc',
  'lgc',
  'gdc',
  'cdc',
  'adc',
  'dc',
  'uf',
  'clube',
  'futebol',
  'sport',
  'sporting',
  'desportivo',
  'atletico',
  'atlético',
  'associacao',
  'associação',
  'uniao',
  'união',
  'grupo',
  'academico',
  'académico',
  'academia',
  'os',
  'as',
  'da',
  'de',
  'do',
  'e'
]

function limpar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Os indicadores ordinais (º, ª) são letras em Unicode e colavam-se aos
    // números — "Campo Nº1" ficava com o pedaço "nº1" por tratar.
    .replace(/[ºª]/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Números de campo e ordinais não localizam nada: "Campo Nº 1", "n5". */
function ePedacoInutil(palavra: string): boolean {
  const p = palavra.toLowerCase()
  return /^\d+$/.test(p) || /^n\.?\d*$/.test(p) || !/[\p{L}\p{N}]/u.test(p)
}

/** Retira do nome do recinto as palavras que só descrevem a instalação. */
export function simplificarRecinto(nome: string): string {
  const palavras = limpar(nome)
    .split(' ')
    .filter((p) => p.length > 0 && !ePedacoInutil(p))
    .filter((p) => !PALAVRAS_INSTALACAO.includes(p.toLowerCase()))
  return palavras.join(' ').trim()
}

/** Retira do nome do clube as siglas e palavras genéricas, deixando o topónimo. */
export function simplificarClube(nome: string): string {
  const palavras = limpar(nome)
    .split(' ')
    .filter((p) => p.length > 0 && !ePedacoInutil(p))
    .filter((p) => !RUIDO_CLUBE.includes(p.toLowerCase()))
  return palavras.join(' ').trim()
}

export function consultasParaRecinto(
  nome: string,
  morada: string | null,
  nomesClubes: string[]
): Consulta[] {
  const consultas: Consulta[] = []
  const vistos = new Set<string>()
  const juntar = (termo: string, origem: OrigemCoordenadas, fiavel: boolean): void => {
    const limpo = termo.trim()
    if (limpo.length < 3) return
    const chave = limpo.toLowerCase()
    if (vistos.has(chave)) return
    vistos.add(chave)
    consultas.push({ termo: `${limpo}, Portugal`, origem, fiavel })
  }

  if (morada?.trim()) juntar(morada, 'MORADA', true)
  juntar(nome, 'NOME', true)

  const simplificado = simplificarRecinto(nome)
  if (simplificado.toLowerCase() !== limpar(nome).toLowerCase()) {
    juntar(simplificado, 'NOME_SIMPLIFICADO', false)
  }

  for (const clube of nomesClubes) {
    juntar(clube, 'CLUBE', false)
    const clubeSimples = simplificarClube(clube)
    if (clubeSimples.toLowerCase() !== limpar(clube).toLowerCase()) {
      juntar(clubeSimples, 'CLUBE_SIMPLIFICADO', false)
    }
  }

  return consultas
}
