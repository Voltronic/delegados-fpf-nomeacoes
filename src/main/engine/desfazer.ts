import type { Nomeacao, PapelNomeacao } from '../../shared/tipos'
import { guardarNomeacao, listarNomeacoesDoJogo, obterJogoDetalhado, removerNomeacao } from '../db/repos'

/**
 * Desfazer a última alteração a nomeações.
 *
 * O coordenador trabalha depressa numa lista com dezenas de jogos, e enganar-se
 * na linha ou no papel é fácil. Sem uma forma óbvia de voltar atrás, a reação
 * natural é ter medo de mexer — e o medo faz perder mais tempo do que o erro.
 *
 * Guarda-se só a última ação, em memória: é o que se usa a seguir a um clique
 * errado. Para tudo o resto existem as cópias de segurança.
 */
export interface AccaoReversivel {
  /** Frase pronta a mostrar: "nomeação de Ana Ribeiro como principal". */
  descricao: string
  jogoId: number
  papel: PapelNomeacao
  /** Nomeação que existia antes; `null` quando o papel estava livre. */
  anterior: Nomeacao | null
}

let ultima: AccaoReversivel | null = null

/** O estado de um papel num jogo, tal como está agora. */
function estadoAtual(jogoId: number, papel: PapelNomeacao): Nomeacao | null {
  return listarNomeacoesDoJogo(jogoId).find((n) => n.papel === papel) ?? null
}

/**
 * Regista o que estava antes de uma alteração. Chama-se **antes** de mexer,
 * porque depois já não há maneira de saber o que lá estava.
 */
export function registarAlteracao(jogoId: number, papel: PapelNomeacao, descricao: string): void {
  ultima = { descricao, jogoId, papel, anterior: estadoAtual(jogoId, papel) }
}

export function ultimaAccao(): { descricao: string } | null {
  return ultima ? { descricao: ultima.descricao } : null
}

export function esquecerUltimaAccao(): void {
  ultima = null
}

/**
 * Repõe o estado anterior do papel afetado pela última alteração. Devolve o
 * jogo já atualizado, ou `null` se não houver nada para desfazer.
 */
export function desfazerUltimaAccao(): ReturnType<typeof obterJogoDetalhado> {
  if (!ultima) return null
  const { jogoId, papel, anterior } = ultima
  // Uma só vez: desfazer duas vezes seguidas repetiria a mesma reposição.
  ultima = null

  if (anterior) {
    guardarNomeacao({
      jogoId,
      delegadoId: anterior.delegadoId,
      papel,
      km: anterior.km,
      minutos: anterior.minutos,
      fonteDistancia: anterior.fonteDistancia,
      estado: anterior.estado,
      motivoOverride: anterior.motivoOverride
    })
  } else {
    removerNomeacao(jogoId, papel)
  }

  return obterJogoDetalhado(jogoId)
}
