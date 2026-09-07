import type { Candidato, PapelNomeacao } from '@shared/tipos'
import { avaliarCandidatos } from './motor'
import type { EntradaMotor, EstadoDelegado } from './tipos'

export interface AtribuicaoAutomatica {
  jogoId: number
  papel: PapelNomeacao
  delegadoId: number
  km: number | null
  minutos: number | null
  fonteDistancia: Candidato['fonteDistancia']
  score: number
  motivo: string
}

export interface EntradaAutomatica {
  /** Uma entrada de motor por jogo a nomear, já com o estado atual dos delegados. */
  jogos: EntradaMotor[]
  /** Quais os jogos que levam também delegado de campo. */
  usaDelegadoCampo: (jogoId: number) => boolean
}

/**
 * Gera uma proposta de nomeações para um conjunto de jogos.
 *
 * Estratégia: trata primeiro os jogos com menos candidatos elegíveis (os mais
 * difíceis de preencher), e vai atualizando o estado dos delegados à medida que
 * atribui, para que o equilíbrio de km seja recalculado dentro da própria
 * proposta e não fique tudo em cima dos mesmos dois ou três nomes.
 */
export function gerarProposta(entrada: EntradaAutomatica): AtribuicaoAutomatica[] {
  const atribuicoes: AtribuicaoAutomatica[] = []
  // Estado partilhado e mutável ao longo da proposta, indexado por delegado.
  const estados = new Map<number, EstadoDelegado>()
  for (const jogo of entrada.jogos) {
    for (const estado of jogo.delegados) {
      if (!estados.has(estado.delegado.id)) estados.set(estado.delegado.id, clonar(estado))
    }
  }

  const porDificuldade = [...entrada.jogos].sort((a, b) => {
    const ea = contarElegiveis(a, estados)
    const eb = contarElegiveis(b, estados)
    if (ea !== eb) return ea - eb
    return (a.jogo.dataHora ?? '').localeCompare(b.jogo.dataHora ?? '')
  })

  for (const jogoEntrada of porDificuldade) {
    const jaNomeados = [...jogoEntrada.jaNomeados]
    const papeis: PapelNomeacao[] = entrada.usaDelegadoCampo(jogoEntrada.jogo.jogoId)
      ? ['PRINCIPAL', 'CAMPO']
      : ['PRINCIPAL']

    for (const papel of papeis) {
      const candidatos = avaliarCandidatos({
        ...jogoEntrada,
        papel,
        jaNomeados,
        delegados: jogoEntrada.delegados.map((e) => estados.get(e.delegado.id)!)
      })
      const escolhido = candidatos.find((c) => c.elegivel)
      if (!escolhido) continue

      atribuicoes.push({
        jogoId: jogoEntrada.jogo.jogoId,
        papel,
        delegadoId: escolhido.delegadoId,
        km: escolhido.kmViagem,
        minutos: escolhido.minutosViagem,
        fonteDistancia: escolhido.fonteDistancia,
        score: escolhido.score,
        motivo: resumirMotivo(escolhido)
      })
      jaNomeados.push(escolhido.delegadoId)
      aplicarAtribuicao(estados.get(escolhido.delegadoId)!, jogoEntrada, escolhido)
    }
  }

  return atribuicoes.sort((a, b) => a.jogoId - b.jogoId)
}

function contarElegiveis(entrada: EntradaMotor, estados: Map<number, EstadoDelegado>): number {
  const delegados = entrada.delegados.map((e) => estados.get(e.delegado.id) ?? e)
  return avaliarCandidatos({ ...entrada, delegados }).filter((c) => c.elegivel).length
}

/** Reflete a atribuição no estado do delegado, para os jogos seguintes da proposta. */
function aplicarAtribuicao(estado: EstadoDelegado, entrada: EntradaMotor, candidato: Candidato): void {
  estado.kmEpoca += candidato.kmViagem ?? 0
  estado.jogosEpoca += 1
  const { clubeCasaId, clubeForaId, competicaoId, jogoId, dataHora } = entrada.jogo
  estado.clubesFeitos[clubeCasaId] = (estado.clubesFeitos[clubeCasaId] ?? 0) + 1
  estado.clubesFeitos[clubeForaId] = (estado.clubesFeitos[clubeForaId] ?? 0) + 1
  estado.jogosPorCompeticao[competicaoId] = (estado.jogosPorCompeticao[competicaoId] ?? 0) + 1
  estado.agenda.push({ jogoId, dataHora })
  if (dataHora && (!estado.ultimaNomeacaoEm || dataHora > estado.ultimaNomeacaoEm)) {
    estado.ultimaNomeacaoEm = dataHora
  }
}

function clonar(estado: EstadoDelegado): EstadoDelegado {
  return {
    ...estado,
    clubesFeitos: { ...estado.clubesFeitos },
    jogosPorCompeticao: { ...estado.jogosPorCompeticao },
    indisponibilidades: [...estado.indisponibilidades],
    clubesVetados: [...estado.clubesVetados],
    agenda: [...estado.agenda]
  }
}

function resumirMotivo(candidato: Candidato): string {
  const principais = [...candidato.componentes]
    .sort((a, b) => b.contributo - a.contributo)
    .slice(0, 2)
    .map((c) => c.detalhe)
  return principais.join(' · ')
}
