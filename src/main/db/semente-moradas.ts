import type Database from 'better-sqlite3'

/**
 * Moradas de delegados corrigidas depois de a aplicação já estar em uso.
 *
 * Uma morada errada não se nota: o delegado continua a aparecer nas listas e os
 * km saem calculados na mesma — só que a partir do sítio errado. Quando a
 * correção aparece, tem de chegar a todas as máquinas onde a aplicação já
 * trabalha, e não só àquela onde foi feita.
 *
 * Corre uma vez por versão desta lista. Só toca nos delegados que aqui estão e
 * que ainda tenham a morada antiga; quem já estiver no sítio certo fica como
 * está.
 */
export interface MoradaSemente {
  /** O número é a chave: é o que identifica o delegado na FPF. */
  numero: string
  /** Confere-se também o nome, para não corrigir a pessoa errada. */
  nome: string
  morada: string
  lat: number
  lng: number
}

export const MORADAS_SEMENTE: MoradaSemente[] = [
  { numero: '110', nome: 'Fernando Ferreira', morada: 'Lousada', lat: 41.2778714, lng: -8.2815432 }
]

/** Muda quando a lista muda, e é o que faz esta semente correr outra vez. */
export const VERSAO_MORADAS = '2026-10-06:1'

const CHAVE_CONFIG = 'semente.moradas'

export interface ResultadoMoradas {
  /** Nomes dos delegados cuja morada foi corrigida. */
  corrigidos: string[]
  /** Nomeações que ficaram à espera de novos km. */
  nomeacoesPorRecalcular: number
}

/**
 * Corrige as moradas desta lista e deixa as nomeações desses delegados sem km.
 *
 * Os km ficam a `NULL` de propósito: é o sinal que o arranque usa para os
 * mandar calcular outra vez (`completarKmEmFalta`), já a partir da morada nova.
 * Reescrevê-los aqui obrigaria a semente a falar com o serviço de rotas durante
 * o arranque, e a aplicação ficaria à espera dela para abrir.
 */
export function semearMoradas(conn: Database.Database): ResultadoMoradas {
  const resultado: ResultadoMoradas = { corrigidos: [], nomeacoesPorRecalcular: 0 }
  const jaCorreu = conn.prepare('SELECT valor FROM config WHERE chave = ?').get(CHAVE_CONFIG) as
    | { valor: string }
    | undefined
  if (jaCorreu?.valor === VERSAO_MORADAS) return resultado

  const porNumero = conn.prepare('SELECT id, nome, lat, lng FROM delegado WHERE numero = ?')
  const atualizar = conn.prepare(
    `UPDATE delegado SET morada = ?, lat = ?, lng = ?, coords_manuais = 1 WHERE id = ?`
  )
  const limparCache = conn.prepare('DELETE FROM distancia_cache WHERE delegado_id = ?')
  const limparKm = conn.prepare(
    `UPDATE nomeacao SET km = NULL, minutos = NULL, fonte_distancia = NULL
      WHERE delegado_id = ? AND estado <> 'CANCELADA'`
  )

  const correr = conn.transaction(() => {
    for (const m of MORADAS_SEMENTE) {
      const delegado = porNumero.get(m.numero) as
        | { id: number; nome: string; lat: number | null; lng: number | null }
        | undefined
      if (!delegado || delegado.nome !== m.nome) continue
      if (delegado.lat === m.lat && delegado.lng === m.lng) continue

      atualizar.run(m.morada, m.lat, m.lng, delegado.id)
      limparCache.run(delegado.id)
      // Os km dos jogos que ele já fez foram calculados a partir da morada
      // antiga: ficam por calcular, e o arranque trata deles.
      resultado.nomeacoesPorRecalcular += limparKm.run(delegado.id).changes
      resultado.corrigidos.push(delegado.nome)
    }
    conn
      .prepare(
        'INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
      )
      .run(CHAVE_CONFIG, VERSAO_MORADAS)
  })
  correr()

  return resultado
}
