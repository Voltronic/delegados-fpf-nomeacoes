import { emTransacao } from '../db'
import * as repos from '../db/repos'
import { normalizarNome } from '../fpf/html'
import { interpretar, paraExportacao, serializar, type DelegadoExportado } from './ficheiro'

export interface ResultadoImportacaoDelegados {
  criados: number
  atualizados: number
  /** Vetos que não se puderam repor por o clube não existir nesta base de dados. */
  vetosSemClube: string[]
}

/** Todos os delegados, com indisponibilidades e vetos, prontos a gravar em ficheiro. */
export function exportarDelegados(): string {
  const delegados = repos.listarDelegados(true).map((delegado) =>
    paraExportacao(delegado, repos.listarIndisponibilidades(delegado.id), repos.listarVetos(delegado.id))
  )
  return serializar(delegados)
}

/**
 * Repõe delegados a partir de um ficheiro exportado. O **número** é a chave: um
 * número já existente é atualizado, um novo é criado. Nunca apaga delegados que
 * não venham no ficheiro — importar é sempre acrescentar ou corrigir, para que
 * um ficheiro antigo não destrua trabalho recente.
 */
export function importarDelegados(conteudo: string): ResultadoImportacaoDelegados {
  const entradas = interpretar(conteudo)
  const resultado: ResultadoImportacaoDelegados = { criados: 0, atualizados: 0, vetosSemClube: [] }

  emTransacao(() => {
    // Também os arquivados: o número continua a ser deles, e criar outro com o
    // mesmo número era impossível. Se vierem no ficheiro, voltam ao quadro.
    const porNumero = new Map(repos.listarDelegados(true, true).map((d) => [d.numero, d]))
    const clubes = new Map(repos.listarClubes().map((c) => [normalizarNome(c.nome), c.id]))

    for (const entrada of entradas) {
      const existente = porNumero.get(entrada.numero)
      const dados = {
        numero: entrada.numero,
        nome: entrada.nome,
        morada: entrada.morada,
        lat: entrada.lat,
        lng: entrada.lng,
        nivel: entrada.nivel,
        telefone: entrada.telefone,
        email: entrada.email,
        ativo: entrada.ativo,
        notas: entrada.notas,
        coordsManuais: entrada.coordsManuais
      }
      if (existente?.apagadoEm) repos.restaurarDelegado(existente.id)
      const delegado = existente ? repos.atualizarDelegado(existente.id, dados) : repos.criarDelegado(dados)
      if (existente) resultado.atualizados++
      else resultado.criados++

      reporIndisponibilidades(delegado.id, entrada)
      reporVetos(delegado.id, entrada, clubes, resultado)
    }
  })

  return resultado
}

function reporIndisponibilidades(delegadoId: number, entrada: DelegadoExportado): void {
  // Substituem-se em bloco: repetir a importação não pode duplicar linhas.
  for (const existente of repos.listarIndisponibilidades(delegadoId)) {
    repos.apagarIndisponibilidade(existente.id)
  }
  for (const periodo of entrada.indisponibilidades) {
    repos.criarIndisponibilidade({ delegadoId, ...periodo })
  }
}

function reporVetos(
  delegadoId: number,
  entrada: DelegadoExportado,
  clubes: Map<string, number>,
  resultado: ResultadoImportacaoDelegados
): void {
  for (const existente of repos.listarVetos(delegadoId)) repos.apagarVeto(existente.id)
  for (const veto of entrada.vetos) {
    const clubeId = clubes.get(normalizarNome(veto.clube))
    if (!clubeId) {
      // O clube pode ainda não ter sido importado da FPF; avisa-se em vez de inventar.
      if (!resultado.vetosSemClube.includes(veto.clube)) resultado.vetosSemClube.push(veto.clube)
      continue
    }
    repos.criarVeto({ delegadoId, clubeId, motivo: veto.motivo })
  }
}
