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

export interface JogoSemSugestao {
  jogoId: number
  papel: PapelNomeacao
  /** Porque nenhum delegado serviu — os motivos mais frequentes primeiro. */
  motivos: string[]
}

export interface ResultadoProposta {
  atribuicoes: AtribuicaoAutomatica[]
  semSugestao: JogoSemSugestao[]
}

/**
 * Gera uma proposta de nomeações para um conjunto de jogos.
 *
 * Trata primeiro os jogos com menos candidatos elegíveis — os mais difíceis de
 * preencher — e vai atualizando o estado dos delegados à medida que atribui,
 * para que o equilíbrio de km seja recalculado dentro da própria proposta e não
 * fique tudo em cima dos mesmos dois ou três nomes.
 *
 * Nem todos os jogos ficam cobertos, e isso não é um defeito: com poucos
 * delegados e muitos jogos à mesma hora, esgotam-se os elegíveis. Os que ficam
 * de fora vêm em `semSugestao`, com o motivo, para o coordenador perceber
 * porquê em vez de ficar a olhar para uma lista mais curta do que esperava.
 */
export function gerarProposta(entrada: EntradaAutomatica): ResultadoProposta {
  const atribuicoes: AtribuicaoAutomatica[] = []
  const semSugestao: JogoSemSugestao[] = []
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
      if (!escolhido) {
        // Explicar porquê é o que evita que a proposta pareça arbitrária.
        const contagem = new Map<string, number>()
        for (const c of candidatos) {
          for (const b of c.bloqueios) contagem.set(b.codigo, (contagem.get(b.codigo) ?? 0) + 1)
        }
        semSugestao.push({
          jogoId: jogoEntrada.jogo.jogoId,
          papel,
          motivos: [...contagem.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([codigo, n]) => `${n} ${descreverBloqueio(codigo)}`)
        })
        continue
      }

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

  return {
    atribuicoes: atribuicoes.sort((a, b) => a.jogoId - b.jogoId),
    semSugestao
  }
}

const MOTIVOS: Record<string, string> = {
  CONFLITO_HORARIO: 'já com outro jogo à mesma hora',
  INDISPONIVEL: 'indisponíveis nessa data',
  VETO_CLUBE: 'com veto a um dos clubes',
  NIVEL_INSUFICIENTE: 'sem o nível exigido',
  DISTANCIA_EXCESSIVA: 'acima do limite de distância',
  JA_NOMEADO: 'já nomeados para este jogo',
  INATIVO: 'inativos',
  SEM_COORDENADAS: 'sem coordenadas'
}

function descreverBloqueio(codigo: string): string {
  return MOTIVOS[codigo] ?? codigo.toLowerCase()
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
