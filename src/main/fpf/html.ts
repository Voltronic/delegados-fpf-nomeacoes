/**
 * Utilitários mínimos de HTML. O site da FPF devolve fragmentos previsíveis, pelo
 * que se evita uma dependência de parsing completa — mas tudo o que lida com o
 * HTML vive aqui e em `parsers.ts`, isolado e coberto por testes com fixtures.
 */

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ordm: 'º',
  ordf: 'ª'
}

export function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (todo, nome) => ENTIDADES[nome.toLowerCase()] ?? todo)
}

/** Remove marcação, decodifica entidades e normaliza espaços. */
export function texto(html: string): string {
  return decodificarEntidades(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Devolve o conteúdo de um elemento `<div>`, equilibrando as aberturas e fechos
 * a partir da posição indicada.
 */
export function conteudoDiv(html: string, indiceAbertura: number): string {
  const inicio = html.indexOf('>', indiceAbertura)
  if (inicio === -1) return ''
  let profundidade = 1
  const padrao = /<\/?div\b/gi
  padrao.lastIndex = inicio + 1
  let m: RegExpExecArray | null
  while ((m = padrao.exec(html))) {
    profundidade += m[0].startsWith('</') ? -1 : 1
    if (profundidade === 0) return html.slice(inicio + 1, m.index)
  }
  return html.slice(inicio + 1)
}

/** Normaliza um nome para comparação: sem acentos, sem pontuação, minúsculas. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * O Cloudflare devolve a página de desafio com **HTTP 200**, não com 403. Sem
 * esta deteção a sincronização engolia a página, não encontrava jornadas
 * nenhumas e terminava em silêncio, como se a competição estivesse vazia.
 */
export function pareceDesafioCloudflare(html: string): boolean {
  return (
    /<title>\s*(Just a moment|Attention Required|Access denied)/i.test(html) ||
    /cf-browser-verification|cf-error-details|id="challenge-(form|error|running)"|__cf_chl_|cf_chl_opt/i.test(
      html
    ) ||
    /Enable JavaScript and cookies to continue/i.test(html)
  )
}
