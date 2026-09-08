import type { Delegado, Indisponibilidade, NivelDelegado, VetoClube } from '../../shared/tipos'

/**
 * Formato de ficheiro para levar os delegados para fora da aplicação. Existe
 * porque a base de dados vive na pasta do executável e essa pasta é frágil:
 * quem tiver este ficheiro repõe tudo em segundos, mesmo num PC novo.
 *
 * Os clubes vetados vão por **nome** e não por identificador: os identificadores
 * mudam quando os clubes são reimportados da FPF, o nome não.
 */
export interface DelegadoExportado {
  numero: string
  nome: string
  morada: string | null
  lat: number | null
  lng: number | null
  nivel: NivelDelegado
  telefone: string | null
  email: string | null
  ativo: boolean
  notas: string | null
  coordsManuais: boolean
  indisponibilidades: { dataInicio: string; dataFim: string; motivo: string | null }[]
  vetos: { clube: string; motivo: string | null }[]
}

export interface FicheiroDelegados {
  formato: 'delegados-fpf'
  versao: 1
  exportadoEm: string
  delegados: DelegadoExportado[]
}

export function paraExportacao(
  delegado: Delegado,
  indisponibilidades: Indisponibilidade[],
  vetos: VetoClube[]
): DelegadoExportado {
  return {
    numero: delegado.numero,
    nome: delegado.nome,
    morada: delegado.morada,
    lat: delegado.lat,
    lng: delegado.lng,
    nivel: delegado.nivel,
    telefone: delegado.telefone,
    email: delegado.email,
    ativo: delegado.ativo,
    notas: delegado.notas,
    coordsManuais: delegado.coordsManuais,
    indisponibilidades: indisponibilidades.map((i) => ({
      dataInicio: i.dataInicio,
      dataFim: i.dataFim,
      motivo: i.motivo
    })),
    vetos: vetos.map((v) => ({ clube: v.clubeNome ?? '', motivo: v.motivo })).filter((v) => v.clube !== '')
  }
}

export function serializar(delegados: DelegadoExportado[], agora = new Date()): string {
  const ficheiro: FicheiroDelegados = {
    formato: 'delegados-fpf',
    versao: 1,
    exportadoEm: agora.toISOString(),
    delegados
  }
  return `${JSON.stringify(ficheiro, null, 2)}\n`
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  const limpo = String(valor).trim()
  return limpo === '' ? null : limpo
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

/**
 * Lê um ficheiro exportado. É tolerante com campos em falta — uma lista escrita
 * à mão só com número e nome é aceite — mas recusa-se a adivinhar o que não
 * percebe, para não importar lixo em silêncio.
 */
export function interpretar(conteudo: string): DelegadoExportado[] {
  let bruto: unknown
  try {
    bruto = JSON.parse(conteudo)
  } catch {
    throw new Error('O ficheiro não é JSON válido.')
  }
  const raiz = bruto as Partial<FicheiroDelegados>
  const lista = Array.isArray(bruto) ? bruto : raiz?.delegados
  if (!Array.isArray(lista)) {
    throw new Error('O ficheiro não tem uma lista de delegados.')
  }
  if (!Array.isArray(bruto) && raiz.formato && raiz.formato !== 'delegados-fpf') {
    throw new Error(`Formato desconhecido: ${String(raiz.formato)}.`)
  }

  return lista.map((entrada, indice) => {
    const d = entrada as Record<string, unknown>
    const num = texto(d.numero)
    const nome = texto(d.nome)
    if (!num || !nome) {
      throw new Error(`Delegado ${indice + 1}: número e nome são obrigatórios.`)
    }
    const nivel = String(d.nivel ?? 'PRINCIPAL').toUpperCase()
    if (nivel !== 'ELITE' && nivel !== 'PRINCIPAL') {
      throw new Error(`Delegado ${num}: nível "${String(d.nivel)}" não existe (use ELITE ou PRINCIPAL).`)
    }
    const indisponibilidades = Array.isArray(d.indisponibilidades) ? d.indisponibilidades : []
    const vetos = Array.isArray(d.vetos) ? d.vetos : []
    return {
      numero: num,
      nome,
      morada: texto(d.morada),
      lat: numero(d.lat),
      lng: numero(d.lng),
      nivel: nivel as NivelDelegado,
      telefone: texto(d.telefone),
      email: texto(d.email),
      ativo: d.ativo === undefined ? true : Boolean(d.ativo),
      notas: texto(d.notas),
      coordsManuais: Boolean(d.coordsManuais),
      indisponibilidades: indisponibilidades
        .map((i) => i as Record<string, unknown>)
        .filter((i) => texto(i.dataInicio) && texto(i.dataFim))
        .map((i) => ({
          dataInicio: String(i.dataInicio),
          dataFim: String(i.dataFim),
          motivo: texto(i.motivo)
        })),
      vetos: vetos
        .map((v) => v as Record<string, unknown>)
        .map((v) => ({ clube: texto(v.clube) ?? '', motivo: texto(v.motivo) }))
        .filter((v) => v.clube !== '')
    }
  })
}
