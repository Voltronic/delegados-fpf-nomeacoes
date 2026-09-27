import { normalizarNome } from './html'

/**
 * Palavras que distinguem equipas diferentes do mesmo clube, e que por isso
 * nunca podem ser tomadas por um patrocínio acrescentado ao nome.
 *
 * O Famalicão e o Famalicão "B" são duas equipas, jogam competições
 * diferentes e têm delegados diferentes: confundi-las apagava jogos.
 */
const MARCAS_DE_EQUIPA = new Set(['b', 'c', 'ii', 'iii', '2', '3', 'sub19', 'sub17', 'sub15'])

/**
 * Os dois nomes designam o mesmo clube, um deles com palavras a mais?
 *
 * A FPF acrescenta e tira patrocínios ao longo da época — "Ad Fundão" passou a
 * "Ad Fundão / Alambique" a meio de setembro de 2026. Como a chave de um jogo
 * inclui o nome dos clubes, a atualização seguinte deixou de reconhecer os
 * jogos e criou-os todos outra vez, a dobrar na lista.
 *
 * A regra é deliberadamente estreita: um nome tem de conter todas as palavras
 * do outro, e as que sobram não podem ser marcas de equipa. Quem decide se dois
 * jogos são o mesmo é quem chama isto, com a competição, a jornada, a data e o
 * adversário na mão — só assim é seguro.
 */
export function ePatrocinioAcrescentado(um: string, outro: string): boolean {
  const a = palavras(um)
  const b = palavras(outro)
  if (!a.size || !b.size) return false

  const [curto, longo] = a.size <= b.size ? [a, b] : [b, a]
  for (const palavra of curto) {
    if (!longo.has(palavra)) return false
  }
  const aMais = [...longo].filter((p) => !curto.has(p))
  if (!aMais.length) return false
  return !aMais.some((p) => MARCAS_DE_EQUIPA.has(p))
}

function palavras(nome: string): Set<string> {
  return new Set(normalizarNome(nome).split(' ').filter(Boolean))
}
