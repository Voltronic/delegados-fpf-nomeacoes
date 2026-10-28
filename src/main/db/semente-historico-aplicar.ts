import type Database from 'better-sqlite3'
import { normalizarNome } from '../fpf/html'
import { chaveNatural } from '../fpf/parsers'
import {
  CLUBES_SEMENTE,
  COMPETICOES_SEMENTE,
  JOGOS_SEMENTE,
  RECINTOS_SEMENTE
} from './semente-historico'

export interface ResultadoHistorico {
  clubesCriados: number
  recintosCriados: number
  recintosPreenchidos: number
  competicoesCriadas: number
  jogosCriados: number
}

const VAZIO = (): ResultadoHistorico => ({
  clubesCriados: 0,
  recintosCriados: 0,
  recintosPreenchidos: 0,
  competicoesCriadas: 0,
  jogosCriados: 0
})

/** Marca em `config` que esta semente já correu, para não repetir trabalho. */
const CHAVE_CONFIG = 'semente.historico'
const VERSAO = '2026-2027:2'

/**
 * Põe na base de dados os clubes, os recintos, as competições e os jogos da
 * época que a aplicação traz consigo.
 *
 * Existe para que uma instalação nova tenha com que trabalhar sem pedir ao
 * coordenador que importe competições nenhumas.
 *
 * Uma regra só, e sem exceções: **acrescentar o que falta, nunca mexer no que
 * existe**. Um clube, uma competição ou um jogo que já estejam no destino
 * ficam exatamente como estão, porque o que lá está é trabalho de quem usa a
 * aplicação. Um recinto sem coordenadas é o único caso em que se preenche um
 * buraco, e mesmo esse nunca se corrige se já tiver ponto no mapa.
 *
 * Nomeações não entram aqui de todo: quem nomeia é o coordenador.
 */
export function semearHistorico(conn: Database.Database): ResultadoHistorico {
  const resultado = VAZIO()
  const jaCorreu = conn
    .prepare('SELECT valor FROM config WHERE chave = ?')
    .get(CHAVE_CONFIG) as { valor: string } | undefined
  if (jaCorreu?.valor === VERSAO) return resultado

  const agora = new Date().toISOString()

  const correr = conn.transaction(() => {
    // 1. Clubes. O nome normalizado é a chave: o mesmo clube aparece escrito de
    //    maneiras diferentes consoante a competição.
    const clubePorNome = conn.prepare('SELECT id FROM clube WHERE nome_normalizado = ?')
    const criarClube = conn.prepare(
      'INSERT INTO clube (nome, nome_normalizado, notas) VALUES (?, ?, NULL)'
    )
    const idDoClube = (nome: string): number => {
      const normalizado = normalizarNome(nome)
      const existente = clubePorNome.get(normalizado) as { id: number } | undefined
      if (existente) return existente.id
      const info = criarClube.run(nome, normalizado)
      resultado.clubesCriados++
      return Number(info.lastInsertRowid)
    }
    for (const clube of CLUBES_SEMENTE) idDoClube(clube.nome)

    // 2. Recintos, com as coordenadas já confirmadas. Poupa ao coordenador
    //    localizar duzentos recintos à mão.
    const recintoPorNome = conn.prepare('SELECT id, lat FROM recinto WHERE nome_normalizado = ?')
    const criarRecinto = conn.prepare(
      `INSERT INTO recinto
         (nome, nome_normalizado, morada, lat, lng, coords_manuais, geocodificado_em,
          origem_coords, morada_resolvida, confianca, confirmado)
       VALUES (?, ?, ?, ?, ?, 1, ?, 'CONHECIDO', ?, 'ALTA', ?)`
    )
    const preencherRecinto = conn.prepare(
      `UPDATE recinto
          SET morada = COALESCE(morada, ?), lat = ?, lng = ?, coords_manuais = 1,
              geocodificado_em = ?, origem_coords = 'CONHECIDO', confianca = 'ALTA',
              confirmado = ?
        WHERE id = ?`
    )
    const idDoRecinto = (nome: string): number | null => {
      const normalizado = normalizarNome(nome)
      const existente = recintoPorNome.get(normalizado) as { id: number; lat: number | null } | undefined
      const dados = RECINTOS_SEMENTE.find((r) => normalizarNome(r.nome) === normalizado)
      if (!existente) {
        const info = criarRecinto.run(
          nome,
          normalizado,
          dados?.morada ?? null,
          dados?.lat ?? null,
          dados?.lng ?? null,
          agora,
          dados?.morada ?? null,
          dados?.confirmado ? 1 : 0
        )
        resultado.recintosCriados++
        return Number(info.lastInsertRowid)
      }
      if (existente.lat == null && dados?.lat != null) {
        preencherRecinto.run(dados.morada, dados.lat, dados.lng, agora, dados.confirmado ? 1 : 0, existente.id)
        resultado.recintosPreenchidos++
      }
      return existente.id
    }
    for (const recinto of RECINTOS_SEMENTE) idDoRecinto(recinto.nome)

    // 3. Épocas e competições. Uma competição que já exista fica como está: as
    //    definições são do coordenador.
    const criarEpoca = conn.prepare(
      'INSERT OR IGNORE INTO epoca (season_id, descricao, criada_em) VALUES (?, ?, ?)'
    )
    const competicaoPorFpf = conn.prepare(
      'SELECT id FROM competicao WHERE fpf_competition_id = ? AND season_id = ?'
    )
    const criarCompeticao = conn.prepare(
      `INSERT INTO competicao
         (fpf_competition_id, season_id, season_descricao, nome, organizacao, ativa,
          nivel_minimo, usa_delegado_assistente, todos_com_delegado)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    const idDaCompeticao = new Map<number, number>()
    for (const c of COMPETICOES_SEMENTE) {
      criarEpoca.run(c.seasonId, c.seasonDescricao, agora)
      const existente = competicaoPorFpf.get(c.fpfCompetitionId, c.seasonId) as { id: number } | undefined
      if (existente) {
        idDaCompeticao.set(c.fpfCompetitionId, existente.id)
        continue
      }
      const info = criarCompeticao.run(
        c.fpfCompetitionId,
        c.seasonId,
        c.seasonDescricao,
        c.nome,
        c.organizacao,
        c.nivelMinimo,
        c.usaDelegadoAssistente ? 1 : 0,
        c.todosComDelegado ? 1 : 0
      )
      resultado.competicoesCriadas++
      idDaCompeticao.set(c.fpfCompetitionId, Number(info.lastInsertRowid))
    }

    // 4. Jogos. A chave natural é construída como a sincronização a constrói,
    //    com o id local da competição: assim, uma importação futura reconhece
    //    estes jogos e atualiza-os em vez de os duplicar.
    const jogoPorChave = conn.prepare('SELECT id FROM jogo WHERE chave_natural = ?')
    const criarJogo = conn.prepare(
      `INSERT INTO jogo
         (chave_natural, competicao_id, fase, serie, jornada, fpf_fixture_id, fpf_match_id,
          data_hora, clube_casa_id, clube_fora_id, recinto_id, recinto_texto_fpf, estado, importado_em)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const j of JOGOS_SEMENTE) {
      const competicaoId = idDaCompeticao.get(j.competicaoFpf)
      if (competicaoId == null) continue
      const chave = chaveNatural(competicaoId, j.fixtureId ?? 0, j.casa, j.fora)
      // Um jogo que já exista fica como está — hora, recinto e estado são os
      // que a aplicação foi buscando à FPF ou o coordenador corrigiu à mão.
      if (jogoPorChave.get(chave)) continue
      criarJogo.run(
        chave,
        competicaoId,
        j.fase,
        j.serie,
        j.jornada,
        j.fixtureId,
        j.dataHora,
        idDoClube(j.casa),
        idDoClube(j.fora),
        j.recinto ? idDoRecinto(j.recinto) : null,
        j.recintoTextoFpf,
        j.estado,
        agora
      )
      resultado.jogosCriados++
    }

    conn
      .prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run(CHAVE_CONFIG, VERSAO)
  })
  correr()

  return resultado
}
