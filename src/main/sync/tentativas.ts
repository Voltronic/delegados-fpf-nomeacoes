import type { ResultadoAtualizacao } from '@shared/tipos'

/**
 * Quando voltar a tentar as competições que falharam numa atualização.
 *
 * O site da FPF recusa pedidos às vezes, e costuma passar em poucos minutos.
 * Esperar pela atualização da hora seguinte deixava o aviso de erro no ecrã uma
 * hora inteira por causa de um travão de um minuto. Tenta-se outra vez aos 5, 10
 * e 20 minutos; se continuar a falhar, fica para a hora seguinte, para não
 * insistir com um site que está mesmo a bloquear.
 */
export const ESPERAS_NOVA_TENTATIVA_MS = [5, 10, 20].map((minutos) => minutos * 60 * 1000)

/** Quanto esperar antes da tentativa seguinte, ou `null` se as tentativas rápidas acabaram. */
export function esperaAteNovaTentativa(feitas: number): number | null {
  return ESPERAS_NOVA_TENTATIVA_MS[feitas] ?? null
}

/**
 * O que voltar a tentar depois de uma atualização: nada se correu sem erros, só
 * as competições que não foram lidas se se sabe quais, e todas se não se sabe.
 */
export function competicoesATentar(resultado: ResultadoAtualizacao): number[] | 'todas' | null {
  if (!resultado.erros.length) return null
  return resultado.competicoesComErro?.length ? resultado.competicoesComErro : 'todas'
}
