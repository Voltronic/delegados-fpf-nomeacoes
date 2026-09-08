import type Database from 'better-sqlite3'
import { normalizarNome } from '../fpf/html'
import { RECINTOS_CONHECIDOS } from '../geo/recintosConhecidos'

export interface ResultadoSemente {
  /** Recintos que não existiam e passaram a existir, já localizados. */
  criados: number
  /** Recintos que existiam sem ponto no mapa e ficaram com coordenadas. */
  preenchidos: number
}

/**
 * Põe na base de dados os recintos cuja localização já está confirmada.
 *
 * Corre em cada arranque e **só acrescenta**: um recinto que já exista com
 * coordenadas nunca é tocado, porque o que lá está veio do coordenador e vale
 * mais do que esta lista. Se existir sem coordenadas, preenche-se — é o buraco
 * que esta semente serve para tapar, e nada se perde.
 *
 * Sem isto, cada instalação nova teria de localizar 90 recintos pelo
 * OpenStreetMap (minutos de espera, vários por confirmar à mão) para chegar
 * exatamente ao mesmo sítio.
 */
export function semearRecintos(conn: Database.Database): ResultadoSemente {
  const existente = conn.prepare(
    'SELECT id, lat, morada FROM recinto WHERE nome_normalizado = ?'
  )
  const inserir = conn.prepare(
    `INSERT INTO recinto
       (nome, nome_normalizado, morada, lat, lng, coords_manuais, geocodificado_em,
        origem_coords, morada_resolvida, confianca, confirmado)
     VALUES (?, ?, ?, ?, ?, 1, ?, 'CONHECIDO', ?, 'ALTA', 1)`
  )
  const preencher = conn.prepare(
    `UPDATE recinto
        SET morada = COALESCE(morada, ?), lat = ?, lng = ?, coords_manuais = 1,
            geocodificado_em = ?, origem_coords = 'CONHECIDO',
            morada_resolvida = COALESCE(morada_resolvida, ?), confianca = 'ALTA', confirmado = 1
      WHERE id = ?`
  )

  const resultado: ResultadoSemente = { criados: 0, preenchidos: 0 }
  const agora = new Date().toISOString()

  const correr = conn.transaction(() => {
    for (const recinto of RECINTOS_CONHECIDOS) {
      const descricao = recinto.descricao.trim() === '' ? null : recinto.descricao
      const linha = existente.get(normalizarNome(recinto.nome)) as
        | { id: number; lat: number | null; morada: string | null }
        | undefined

      if (!linha) {
        inserir.run(
          recinto.nome,
          normalizarNome(recinto.nome),
          descricao,
          recinto.lat,
          recinto.lng,
          agora,
          descricao
        )
        resultado.criados++
        continue
      }
      if (linha.lat == null) {
        preencher.run(descricao, recinto.lat, recinto.lng, agora, descricao, linha.id)
        resultado.preenchidos++
      }
      // Já existe e já tem ponto no mapa: não se mexe.
    }
  })
  correr()

  return resultado
}
