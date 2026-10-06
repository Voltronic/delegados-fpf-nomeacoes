/**
 * Nome curto de uma competição, para cabeçalhos de tabela.
 *
 * A matriz do dashboard tem uma coluna por competição — são mais de vinte — e
 * com os nomes completos ("CAMPEONATO NACIONAL SUB-15 I DIVISÃO") a tabela
 * ficava com o dobro da largura do ecrã e empurrava a página inteira para o
 * lado. O nome completo continua à mão, no `title` da coluna.
 *
 * Não é uma lista de nomes conhecidos de propósito: as competições mudam de
 * época para época, e uma lista desatualizada daria cabeçalhos vazios. O que
 * se faz é tirar o que não distingue nada — o patrocinador e as palavras que
 * todas partilham — e ficar com o resto.
 */

/** O patrocinador não distingue competições: está em quase todas. */
const PATROCINIOS = /\b(placard|generali|tranquilidade|vodafone|cândido oliveira|candido oliveira)\b/gi

/** Palavras que aparecem em tantas competições que não ajudam a distingui-las. */
const GENERICAS = /\b(campeonato|nacional|divisão|divisao|futebol|de|da|do|dos|das|e)\b/gi

/** Abreviaturas de palavras longas que sobram depois da limpeza. */
const CURTAS: [RegExp, string][] = [
  [/\bfeminino\b|\bfeminina\b/gi, 'Fem.'],
  [/\bsupertaça\b/gi, 'Supertaça']
]

/** Palavras que se escrevem sempre assim, e que a capitalização estragaria. */
const TAL_E_QUAL = new Set(['BPI', 'I', 'II', 'III', 'IV', 'V', 'Fem.'])

const MAXIMO = 18

function capitalizar(palavra: string): string {
  if (TAL_E_QUAL.has(palavra)) return palavra
  if (TAL_E_QUAL.has(palavra.toUpperCase())) return palavra.toUpperCase()
  // "SUB-15" e "2.ª" mantêm a forma; o resto fica com a inicial maiúscula.
  return palavra
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
    .join('-')
}

export function abreviarCompeticao(nome: string): string {
  let texto = nome.replace(PATROCINIOS, ' ').replace(GENERICAS, ' ')
  for (const [procurar, substituir] of CURTAS) texto = texto.replace(procurar, substituir)

  const palavras = texto
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(capitalizar)

  // Se não sobrar nada (o nome era só palavras genéricas), vale mais o nome
  // original cortado do que uma coluna em branco.
  const curto = palavras.join(' ') || nome
  if (curto.length <= MAXIMO) return curto
  // Antes de cortar a meio de uma palavra, encurta-se a mais longa e repetida.
  const comST = curto.replace(/\bSupertaça\b/g, 'ST')
  if (comST.length <= MAXIMO) return comST
  return `${comST.slice(0, MAXIMO - 1).trimEnd()}…`
}
