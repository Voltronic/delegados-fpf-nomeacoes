/**
 * Avisos curtos no canto do ecrã, para confirmar que uma gravação correu bem —
 * ou dizer porque falhou.
 *
 * Sem isto, carregar em "Guardar" não dava sinal nenhum: o coordenador ficava
 * sem saber se os dados tinham ficado gravados.
 */

export type TipoAviso = 'sucesso' | 'erro'

export interface Aviso {
  id: number
  texto: string
  tipo: TipoAviso
}

let proximoId = 1
const ouvintes = new Set<(aviso: Aviso) => void>()

export function avisar(texto: string, tipo: TipoAviso = 'sucesso'): void {
  const aviso: Aviso = { id: proximoId++, texto, tipo }
  for (const ouvinte of ouvintes) ouvinte(aviso)
}

export function subscreverAvisos(ouvinte: (aviso: Aviso) => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

/**
 * As mensagens que vêm do processo principal chegam embrulhadas pelo canal IPC
 * ("Error invoking remote method '...': Error: ..."). O que interessa ao
 * coordenador é a frase final.
 */
export function mensagemDeErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro)
  return texto.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

/**
 * Executa uma gravação, avisa em caso de sucesso e explica em caso de falha.
 * Devolve `null` quando falhou, para quem chama poder não seguir em frente.
 */
export async function guardarCom<T>(accao: () => Promise<T>, sucesso: string): Promise<T | null> {
  try {
    const resultado = await accao()
    avisar(sucesso, 'sucesso')
    return resultado
  } catch (erro) {
    avisar(mensagemDeErro(erro), 'erro')
    return null
  }
}
