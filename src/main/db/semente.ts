import type Database from 'better-sqlite3'
import { normalizarNome } from '../fpf/html'
import { RECINTOS_CONHECIDOS } from '../geo/recintosConhecidos'

export interface ResultadoSemente {
  /** Recintos que não existiam e passaram a existir, já localizados. */
  criados: number
  /** Recintos que existiam sem ponto no mapa e ficaram com coordenadas. */
  preenchidos: number
  /** Recintos que existiam noutro sítio ou com outra descrição, e foram corrigidos. */
  atualizados: number
}

/**
 * Põe na base de dados os recintos cuja localização já está confirmada.
 *
 * Corre em cada arranque: cria os que faltam, preenche os que estão sem ponto
 * no mapa e corrige os que estão noutro sítio. A lista manda, porque sai da
 * base de dados de quem confirma os recintos um a um — é assim que uma
 * correção dele (um recinto que estava no país errado, por exemplo) chega a
 * todas as instalações sem ninguém repetir o trabalho.
 *
 * A consequência, dita por extenso: um recinto desta lista que seja movido à
 * mão noutra máquina volta ao ponto da lista no arranque seguinte. Recintos
 * que não estejam na lista nunca são tocados.
 *
 * Sem isto, cada instalação nova teria de localizar centenas de recintos pelo
 * OpenStreetMap (minutos de espera, vários por confirmar à mão) para chegar
 * exatamente ao mesmo sítio.
 */
export function semearRecintos(conn: Database.Database): ResultadoSemente {
  const existente = conn.prepare(
    'SELECT id, lat, lng, morada FROM recinto WHERE nome_normalizado = ?'
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

  const corrigir = conn.prepare(
    `UPDATE recinto
        SET morada = COALESCE(?, morada), lat = ?, lng = ?, coords_manuais = 1,
            geocodificado_em = ?, origem_coords = 'CONHECIDO',
            morada_resolvida = COALESCE(?, morada_resolvida), confianca = 'ALTA', confirmado = 1
      WHERE id = ?`
  )

  const resultado: ResultadoSemente = { criados: 0, preenchidos: 0, atualizados: 0 }
  // Coordenadas são de vírgula flutuante: comparam-se com folga, senão o mesmo
  // ponto contava como diferente a cada arranque.
  const mesmoPonto = (a: number | null, b: number): boolean => a != null && Math.abs(a - b) < 1e-7
  const agora = new Date().toISOString()

  const correr = conn.transaction(() => {
    for (const recinto of RECINTOS_CONHECIDOS) {
      const descricao = recinto.descricao.trim() === '' ? null : recinto.descricao
      const linha = existente.get(normalizarNome(recinto.nome)) as
        | { id: number; lat: number | null; lng: number | null; morada: string | null }
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
        continue
      }

      // Já tem ponto no mapa: corrige-se se for outro, ou se a descrição
      // mudou. Uma descrição vazia na lista não apaga a que lá está.
      const pontoDiferente = !mesmoPonto(linha.lat, recinto.lat) || !mesmoPonto(linha.lng, recinto.lng)
      const descricaoDiferente = !!descricao && descricao !== linha.morada
      if (pontoDiferente || descricaoDiferente) {
        corrigir.run(descricao, recinto.lat, recinto.lng, agora, descricao, linha.id)
        resultado.atualizados++
      }
    }
  })
  correr()

  return resultado
}
