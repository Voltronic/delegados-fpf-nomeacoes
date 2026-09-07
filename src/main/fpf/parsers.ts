import type { CompeticaoFpf, EpocaFpf, JogoFpf, OrganizacaoFpf } from '@shared/tipos'
import { conteudoDiv, decodificarEntidades, texto } from './html'

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12
}

/** "2026-2027" -> [2026, 2027] */
export function anosDaEpoca(descricao: string): [number, number] {
  const m = descricao.match(/(\d{4})\s*[-/]\s*(\d{4})/)
  if (m) return [Number(m[1]), Number(m[2])]
  const unico = descricao.match(/(\d{4})/)
  const ano = unico ? Number(unico[1]) : new Date().getFullYear()
  return [ano, ano + 1]
}

/**
 * As listagens de jornada só trazem "13 set" — o ano tem de vir da época.
 * Convenção: julho a dezembro pertencem ao primeiro ano da época.
 */
export function resolverData(
  dataTexto: string | null,
  horaTexto: string | null,
  epoca: [number, number]
): string | null {
  if (!dataTexto) return null
  const m = dataTexto.trim().match(/(\d{1,2})\s+([a-zç]{3,})/i)
  if (!m) return null
  const dia = Number(m[1])
  const mes = MESES[m[2].slice(0, 3).toLowerCase()]
  if (!mes) return null
  const ano = mes >= 7 ? epoca[0] : epoca[1]
  const hora = horaTexto?.match(/(\d{1,2}):(\d{2})/)
  const hh = hora ? hora[1].padStart(2, '0') : '00'
  const mm = hora ? hora[2] : '00'
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${hh}:${mm}`
}

// ---------------------------------------------------------------------------
// /Competition  — épocas e organizações
// ---------------------------------------------------------------------------

export function parseEpocas(html: string): EpocaFpf[] {
  const bloco = html.match(/<select[^>]*name="SeasonId"[^>]*>([\s\S]*?)<\/select>/i)
  if (!bloco) return []
  const epocas: EpocaFpf[] = []
  const padrao = /<option([^>]*)value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi
  let m: RegExpExecArray | null
  while ((m = padrao.exec(bloco[1]))) {
    epocas.push({
      seasonId: Number(m[2]),
      descricao: texto(m[3]),
      selecionada: /selected/i.test(m[1])
    })
  }
  return epocas
}

export function parseOrganizacoes(html: string): OrganizacaoFpf[] {
  const organizacoes: OrganizacaoFpf[] = []
  const blocos = html.split('<span class="list-item').slice(1)
  for (const bloco of blocos) {
    const nomeM = bloco.match(/class="list-text">\s*([\s\S]*?)\s*<\/span>/i)
    if (!nomeM) continue
    const nome = texto(nomeM[1])
    if (!nome) continue

    const competicoes: CompeticaoFpf[] = []
    // A modalidade vem de um <span class="sep"> que antecede cada lista.
    const padrao = /<span class="sep">([\s\S]*?)<\/span>|competitionId=(\d+)&(?:amp;)?seasonId=\d+"[^>]*>([\s\S]*?)<\/a>/gi
    let modalidade: string | null = null
    let m: RegExpExecArray | null
    while ((m = padrao.exec(bloco))) {
      if (m[1] !== undefined) {
        modalidade = texto(m[1]) || null
      } else {
        competicoes.push({
          competitionId: Number(m[2]),
          nome: texto(m[3]),
          modalidade
        })
      }
    }
    if (competicoes.length) organizacoes.push({ nome, competicoes })
  }
  return organizacoes
}

export interface AssociacaoFpf {
  associationId: number
  nome: string
}

/**
 * As associações distritais aparecem no índice apenas como links — as suas
 * competições exigem um pedido a `GetCompetitionsByAssociation`.
 */
export function parseAssociacoes(html: string): AssociacaoFpf[] {
  const vistas = new Set<number>()
  const associacoes: AssociacaoFpf[] = []
  const padrao = /associationId=(\d+)&(?:amp;)?seasonId=\d+"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = padrao.exec(html))) {
    const id = Number(m[1])
    if (vistas.has(id)) continue
    vistas.add(id)
    const etiqueta = m[2].match(/class="list-text">([\s\S]*?)<\/span>/i)?.[1] ?? m[2]
    const nome = texto(etiqueta.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, ' $1 '))
    if (nome) associacoes.push({ associationId: id, nome })
  }
  return associacoes
}

// ---------------------------------------------------------------------------
// /Competition/Details  — fases, séries e jornadas
// ---------------------------------------------------------------------------

export interface JornadaFpf {
  fixtureId: number
  numero: string
  atual: boolean
}

export interface SerieFpf {
  serieId: number
  nome: string
  jornadas: JornadaFpf[]
}

export interface FaseFpf {
  nome: string
  series: SerieFpf[]
}

export interface DetalhesCompeticaoFpf {
  nome: string
  fases: FaseFpf[]
}

export function parseDetalhesCompeticao(html: string): DetalhesCompeticaoFpf {
  const nome = texto(html.match(/<h2>([\s\S]*?)<\/h2>/i)?.[1] ?? '')

  const fases: FaseFpf[] = []
  const marcadorFase = /<div class="accordion-item">/gi
  const posicoesFase: number[] = []
  let m: RegExpExecArray | null
  while ((m = marcadorFase.exec(html))) posicoesFase.push(m.index)

  const segmentos: { nome: string; html: string }[] = posicoesFase.length
    ? posicoesFase.map((inicio, i) => {
        const fim = posicoesFase[i + 1] ?? html.length
        const trecho = html.slice(inicio, fim)
        const titulo = trecho.match(/class="accordion-title[^"]*">([\s\S]*?)<span class="arrow">/i)
        return { nome: texto(titulo?.[1] ?? '') || 'Fase única', html: trecho }
      })
    : [{ nome: 'Fase única', html }]

  for (const segmento of segmentos) {
    const series: SerieFpf[] = []
    const marcadorSerie = /<div class="game-results[^"]*" id="htmlSerieId_(\d+)">/gi
    const encontros: { serieId: number; inicio: number }[] = []
    while ((m = marcadorSerie.exec(segmento.html))) {
      encontros.push({ serieId: Number(m[1]), inicio: m.index })
    }
    for (let i = 0; i < encontros.length; i++) {
      const fim = encontros[i + 1]?.inicio ?? segmento.html.length
      const trecho = segmento.html.slice(encontros[i].inicio, fim)
      const nomeSerie = texto(trecho.match(/<div class="tag">[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1] ?? '')
      series.push({
        serieId: encontros[i].serieId,
        nome: nomeSerie || `Série ${i + 1}`,
        jornadas: parseJornadas(trecho)
      })
    }
    if (series.length) fases.push({ nome: segmento.nome, series })
  }

  return { nome, fases }
}

function parseJornadas(html: string): JornadaFpf[] {
  const jornadas: JornadaFpf[] = []
  const padrao = /<a class="([^"]*)"[^>]*href="[^"]*fixtureId=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = padrao.exec(html))) {
    jornadas.push({
      fixtureId: Number(m[2]),
      numero: texto(m[3]),
      atual: /\bcurrent\b/.test(m[1])
    })
  }
  return jornadas
}

// ---------------------------------------------------------------------------
// /Competition/GetClassificationAndMatchesByFixture  — jogos de uma jornada
// ---------------------------------------------------------------------------

export interface JogoJornadaFpf {
  matchId: number | null
  clubeCasa: string
  clubeFora: string
  dataTexto: string | null
  horaTexto: string | null
  recinto: string | null
  resultado: string | null
}

export function parseJogosJornada(html: string): JogoJornadaFpf[] {
  const indice = html.search(/<div id="matches">/i)
  const seccao = indice === -1 ? html : conteudoDiv(html, indice)

  const jogos: JogoJornadaFpf[] = []
  const marcador = /<div class="game"[^>]*>/gi
  const inicios: number[] = []
  let m: RegExpExecArray | null
  while ((m = marcador.exec(seccao))) inicios.push(m.index)

  for (let i = 0; i < inicios.length; i++) {
    const fim = inicios[i + 1] ?? seccao.length
    const trecho = seccao.slice(inicios[i], fim)
    // O matchId, quando existe, está no <a> que envolve o bloco do jogo.
    const anterior = seccao.slice(inicios[i - 1] !== undefined ? inicios[i - 1] : 0, inicios[i])
    const matchId = anterior.match(/matchId=(\d+)/)?.[1] ?? null

    const casa = trecho.match(/<div class="home-team[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const fora = trecho.match(/<div class="away-team[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (!casa || !fora) continue

    const agenda = trecho.match(/<span class="game-schedule">([\s\S]*?)<\/span>/i)
    const agendaTexto = agenda ? decodificarEntidades(agenda[1].replace(/<br\s*\/?>/gi, '|')) : ''
    const partes = agendaTexto
      .split('|')
      .map((p) => p.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)

    const resultadoM = trecho.match(/<span>\s*(\d+\s*-\s*\d+)\s*<\/span>/)
    const recinto = trecho.match(/class="game-list-stadium"[\s\S]*?<small[^>]*>([\s\S]*?)<\/small>/i)

    jogos.push({
      matchId: matchId ? Number(matchId) : null,
      clubeCasa: texto(casa[1]),
      clubeFora: texto(fora[1]),
      dataTexto: partes[0] ?? null,
      horaTexto: partes.find((p) => /\d{1,2}:\d{2}/.test(p)) ?? null,
      recinto: recinto ? texto(recinto[1]) : null,
      resultado: resultadoM ? resultadoM[1].replace(/\s+/g, ' ') : null
    })
  }

  return jogos
}

// ---------------------------------------------------------------------------
// /Match/GetMatchInformation  — detalhe de um jogo
// ---------------------------------------------------------------------------

export interface InfoJogoFpf {
  data: string | null // DD-MM-YYYY
  hora: string | null // HH:mm
  estadio: string | null
  competicao: string | null
  dataHora: string | null // ISO local
}

export function parseInfoJogo(html: string): InfoJogoFpf {
  // Data, hora e estádio vivem todos num único bloco `info-time-place`; delimitar
  // a leitura a esse bloco evita apanhar o relato do jogo a seguir.
  const indice = html.search(/<div[^>]*class="[^"]*info-time-place[^"]*"/i)
  const plano = texto(indice === -1 ? html : conteudoDiv(html, indice))
  const data = plano.match(/Data:\s*(\d{2}-\d{2}-\d{4})/)?.[1] ?? null
  const hora = plano.match(/Hora:\s*(\d{1,2}:\d{2})/)?.[1] ?? null
  const estadio = plano.match(/Est[áa]dio:\s*(.+?)\s*$/)?.[1]?.trim() || null
  const competicao = texto(html.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] ?? '') || null

  let dataHora: string | null = null
  if (data) {
    const [d, mth, y] = data.split('-')
    dataHora = `${y}-${mth}-${d}T${hora ? hora.padStart(5, '0') : '00:00'}`
  }

  return { data, hora, estadio, competicao, dataHora }
}

/** Combina os dados da jornada com a época para produzir um `JogoFpf` completo. */
export function montarJogo(
  jogo: JogoJornadaFpf,
  contexto: { fixtureId: number; fase: string | null; serie: string | null; jornada: string | null },
  epoca: [number, number]
): JogoFpf {
  return {
    fixtureId: contexto.fixtureId,
    matchId: jogo.matchId,
    fase: contexto.fase,
    serie: contexto.serie,
    jornada: contexto.jornada,
    clubeCasa: jogo.clubeCasa,
    clubeFora: jogo.clubeFora,
    dataTexto: jogo.dataTexto,
    horaTexto: jogo.horaTexto,
    dataHora: resolverData(jogo.dataTexto, jogo.horaTexto, epoca),
    recinto: jogo.recinto,
    resultado: jogo.resultado
  }
}

/** Chave estável para deduplicar: os jogos futuros não têm `matchId`. */
export function chaveNatural(
  competicaoId: number,
  fixtureId: number,
  clubeCasa: string,
  clubeFora: string
): string {
  const limpo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${competicaoId}:${fixtureId}:${limpo(clubeCasa)}:${limpo(clubeFora)}`
}
