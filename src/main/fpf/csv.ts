/**
 * Importação de jogos a partir de ficheiro.
 *
 * É o recurso que não depende de ninguém: cobre qualquer competição, incluindo
 * futsal e formação, que nenhuma API pública de futebol disponibiliza. Serve
 * para quando o site da FPF muda, está em baixo, ou simplesmente não tem o jogo.
 */

export interface LinhaCsv {
  linha: number
  competicao: string
  jornada: string | null
  dataHora: string | null
  clubeCasa: string
  clubeFora: string
  recinto: string | null
}

export interface ResultadoLeituraCsv {
  linhas: LinhaCsv[]
  erros: { linha: number; mensagem: string }[]
  /** Cabeçalhos que não foram reconhecidos, para o utilizador perceber porquê. */
  colunasIgnoradas: string[]
}

/** Cabeçalhos aceites por coluna, já normalizados. */
const COLUNAS: Record<keyof Omit<LinhaCsv, 'linha' | 'dataHora'> | 'data' | 'hora' | 'dataHora', string[]> = {
  competicao: ['competicao', 'competicão', 'competition', 'prova'],
  jornada: ['jornada', 'ronda', 'eliminatoria', 'round'],
  data: ['data', 'date', 'dia'],
  hora: ['hora', 'time', 'horario'],
  dataHora: ['datahora', 'data e hora', 'data hora'],
  clubeCasa: ['casa', 'clube casa', 'clubecasa', 'visitado', 'equipa casa', 'home'],
  clubeFora: ['fora', 'clube fora', 'clubefora', 'visitante', 'equipa fora', 'away'],
  recinto: ['recinto', 'estadio', 'campo', 'local', 'venue']
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Deteta o separador olhando para a linha de cabeçalho. */
export function detetarSeparador(cabecalho: string): string {
  const candidatos = [';', ',', '\t']
  let melhor = ';'
  let maximo = 0
  for (const sep of candidatos) {
    const n = cabecalho.split(sep).length
    if (n > maximo) {
      maximo = n
      melhor = sep
    }
  }
  return melhor
}

/** Divide uma linha respeitando aspas, como o Excel escreve. */
export function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = []
  let atual = ''
  let entreAspas = false

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (entreAspas && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else {
        entreAspas = !entreAspas
      }
    } else if (c === separador && !entreAspas) {
      campos.push(atual.trim())
      atual = ''
    } else {
      atual += c
    }
  }
  campos.push(atual.trim())
  return campos
}

/**
 * Converte data e hora para o ISO local usado na base de dados. Aceita
 * DD/MM/AAAA, DD-MM-AAAA e AAAA-MM-DD, com hora opcional.
 */
export function lerDataHora(data: string, hora: string): string | null {
  const limpo = data.trim()
  if (!limpo) return null

  let ano: string | undefined
  let mes: string | undefined
  let dia: string | undefined

  const iso = limpo.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  const pt = limpo.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (iso) {
    ;[, ano, mes, dia] = iso
  } else if (pt) {
    ;[, dia, mes, ano] = pt
  } else {
    return null
  }

  // A hora pode vir na própria célula da data ("12/09/2026 15:00").
  const h = (hora.trim() || limpo).match(/(\d{1,2}):(\d{2})/)
  const hh = h ? h[1].padStart(2, '0') : '00'
  const mm = h ? h[2] : '00'
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${hh}:${mm}`
}

export function lerCsv(texto: string): ResultadoLeituraCsv {
  const erros: ResultadoLeituraCsv['erros'] = []
  const linhas: LinhaCsv[] = []

  // Remove o BOM que o Excel escreve à cabeça do ficheiro.
  const conteudo = texto.replace(/^﻿/, '')
  const todas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!todas.length) return { linhas, erros: [{ linha: 0, mensagem: 'Ficheiro vazio.' }], colunasIgnoradas: [] }

  const separador = detetarSeparador(todas[0])
  const cabecalhos = dividirLinha(todas[0], separador).map(normalizar)

  const indiceDe = (nomes: string[]): number => cabecalhos.findIndex((c) => nomes.includes(c))
  const idx = {
    competicao: indiceDe(COLUNAS.competicao),
    jornada: indiceDe(COLUNAS.jornada),
    data: indiceDe(COLUNAS.data),
    hora: indiceDe(COLUNAS.hora),
    dataHora: indiceDe(COLUNAS.dataHora),
    clubeCasa: indiceDe(COLUNAS.clubeCasa),
    clubeFora: indiceDe(COLUNAS.clubeFora),
    recinto: indiceDe(COLUNAS.recinto)
  }

  const usados = new Set(Object.values(idx).filter((i) => i >= 0))
  const colunasIgnoradas = cabecalhos.filter((_, i) => !usados.has(i)).filter(Boolean)

  const obrigatorias: [string, number][] = [
    ['competição', idx.competicao],
    ['clube visitado (casa)', idx.clubeCasa],
    ['clube visitante (fora)', idx.clubeFora]
  ]
  const emFalta = obrigatorias.filter(([, i]) => i < 0).map(([nome]) => nome)
  if (emFalta.length) {
    return {
      linhas,
      erros: [{ linha: 1, mensagem: `Faltam colunas obrigatórias: ${emFalta.join(', ')}.` }],
      colunasIgnoradas
    }
  }

  for (let i = 1; i < todas.length; i++) {
    const campos = dividirLinha(todas[i], separador)
    const valor = (indice: number): string => (indice >= 0 ? (campos[indice] ?? '').trim() : '')

    const clubeCasa = valor(idx.clubeCasa)
    const clubeFora = valor(idx.clubeFora)
    const competicao = valor(idx.competicao)

    if (!competicao || !clubeCasa || !clubeFora) {
      erros.push({ linha: i + 1, mensagem: 'Faltam a competição ou um dos clubes.' })
      continue
    }
    if (normalizar(clubeCasa) === normalizar(clubeFora)) {
      erros.push({ linha: i + 1, mensagem: 'O clube visitado e o visitante são o mesmo.' })
      continue
    }

    const dataBruta = idx.dataHora >= 0 ? valor(idx.dataHora) : valor(idx.data)
    const dataHora = lerDataHora(dataBruta, valor(idx.hora))
    if (dataBruta && !dataHora) {
      erros.push({ linha: i + 1, mensagem: `Data não reconhecida: "${dataBruta}".` })
      continue
    }

    linhas.push({
      linha: i + 1,
      competicao,
      jornada: valor(idx.jornada) || null,
      dataHora,
      clubeCasa,
      clubeFora,
      recinto: valor(idx.recinto) || null
    })
  }

  return { linhas, erros, colunasIgnoradas }
}

/** Cabeçalho de exemplo, para o ecrã mostrar o formato esperado. */
export const MODELO_CSV = [
  'Competicao;Jornada;Data;Hora;Casa;Fora;Recinto',
  'CAMPEONATO DE PORTUGAL;5;13/09/2026;15:00;Atl. C. Vila Meã;Fc Vinhais;Estadio Municipal Vila Meã'
].join('\n')
