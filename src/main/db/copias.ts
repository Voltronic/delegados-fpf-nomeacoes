/**
 * Regras de nomeação e rotação das cópias de segurança. Vive à parte da ligação
 * ao SQLite para poder ser testado sem abrir base de dados nenhuma.
 */

/**
 * As cópias ficam **fora** da pasta da aplicação de propósito: a pasta do
 * executável é apagada e regerada a cada versão nova, e uma cópia lá dentro
 * desaparecia com ela.
 */
export const PASTA_COPIAS = String.raw`C:\Temp\delegados-fpf-nomeacoes\backups`

/**
 * Quantas cópias se guardam antes de começar a apagar as mais antigas, fora do
 * arranque: nas cópias criadas à mão e na que se grava antes de repor. No
 * arranque apagam-se logo todas as anteriores (ver `copiasAnteriores`).
 */
export const MAX_COPIAS = 10

export const PADRAO_COPIA = /^delegados-\d{8}-\d{6}\.db$/

/** `delegados-AAAAMMDD-HHMMSS.db` — ordenável alfabeticamente por data. */
export function nomeDaCopia(agora = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `delegados-${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}` +
    `-${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}.db`
  )
}

/** As cópias existentes, da mais recente para a mais antiga. */
export function copiasPorData(nomes: string[]): string[] {
  return nomes.filter((nome) => PADRAO_COPIA.test(nome)).sort().reverse()
}

/** O que sobra depois de guardar as `max` mais recentes. */
export function copiasAApagar(nomes: string[], max = MAX_COPIAS): string[] {
  return copiasPorData(nomes).slice(max)
}

/**
 * O que apagar a seguir à cópia do arranque: todas as cópias menos a que acabou
 * de ser gravada. Ficheiros que não são cópias da aplicação nunca entram.
 */
export function copiasAnteriores(nomes: string[], atual: string): string[] {
  return copiasPorData(nomes).filter((nome) => nome !== atual)
}
