import type Database from 'better-sqlite3'
import { normalizarNome } from '../fpf/html'
import { chaveNatural } from '../fpf/parsers'
import {
  CLUBES_SEMENTE,
  COMPETICOES_SEMENTE,
  JOGOS_SEMENTE,
  NOMEACOES_SEMENTE,
  RECINTOS_SEMENTE
} from './semente-historico'

/**
 * O dia em que a aplicação entrou ao serviço.
 *
 * Antes disto, quem manda é o mapa oficial da FPF: não havia nada em lado
 * nenhum e a semente traz o passado inteiro. Daqui para a frente, quem manda é
 * o coordenador — a semente só corrige um delegado que esteja trocado, e nunca
 * acrescenta nem inventa jogos, porque o que lá está é trabalho dele.
 */
const INICIO_DA_APLICACAO = '2026-09-08'

export interface ResultadoHistorico {
  clubesCriados: number
  recintosCriados: number
  recintosPreenchidos: number
  competicoesCriadas: number
  jogosCriados: number
  horasRepostas: number
  nomeacoesCriadas: number
  nomeacoesSubstituidas: number
  /** Nomeações oficiais posteriores ao arranque que a aplicação não tinha. */
  nomeacoesIgnoradas: number
  delegadosEmFalta: string[]
}

const VAZIO = (): ResultadoHistorico => ({
  clubesCriados: 0,
  recintosCriados: 0,
  recintosPreenchidos: 0,
  competicoesCriadas: 0,
  jogosCriados: 0,
  horasRepostas: 0,
  nomeacoesCriadas: 0,
  nomeacoesSubstituidas: 0,
  nomeacoesIgnoradas: 0,
  delegadosEmFalta: []
})

/** Marca em `config` que esta semente já correu, para não repetir trabalho. */
const CHAVE_CONFIG = 'semente.historico'
const VERSAO = '2026-2027:1'

/**
 * Põe na base de dados o que aconteceu antes de a aplicação começar a ser
 * usada: os jogos da época, os clubes e recintos que eles trazem, e as
 * nomeações oficiais da FPF de julho a setembro de 2026.
 *
 * Existe porque a época já ia a meio quando a aplicação entrou ao serviço, e
 * sem este passado os km e a rotação de clubes começavam a zero para toda a
 * gente — o motor proporia como se ninguém tivesse feito nada. Os mapas
 * oficiais vieram em ficheiros por delegado; aqui entram já casados com os
 * jogos.
 *
 * Vai no executável de propósito: tem de chegar ao computador do coordenador
 * sem lhe pedir que importe competições nenhumas.
 *
 * Regras, iguais às da semente dos recintos: só acrescenta e preenche buracos.
 * Um recinto que já tenha coordenadas nunca é tocado, uma competição que já
 * exista mantém as definições do coordenador, e uma hora só é escrita onde não
 * havia nenhuma. A exceção é o delegado de um jogo: aí manda o mapa oficial,
 * porque é o registo do que realmente aconteceu.
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
    const jogoPorChave = conn.prepare('SELECT id, data_hora FROM jogo WHERE chave_natural = ?')
    const criarJogo = conn.prepare(
      `INSERT INTO jogo
         (chave_natural, competicao_id, fase, serie, jornada, fpf_fixture_id, fpf_match_id,
          data_hora, clube_casa_id, clube_fora_id, recinto_id, recinto_texto_fpf, estado, importado_em)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
    )
    const reporHora = conn.prepare('UPDATE jogo SET data_hora = ? WHERE id = ?')
    const idDoJogo = new Map<string, number>()
    const dataDoJogoPorId = new Map<number, string | null>()
    for (const j of JOGOS_SEMENTE) {
      const competicaoId = idDaCompeticao.get(j.competicaoFpf)
      if (competicaoId == null) continue
      const doPassado = (j.dataHora ?? '') < INICIO_DA_APLICACAO
      const chave = chaveNatural(competicaoId, j.fixtureId ?? 0, j.casa, j.fora)
      const existente = jogoPorChave.get(chave) as { id: number; data_hora: string | null } | undefined
      if (!existente) {
        // Depois do arranque, a lista de jogos é a que a aplicação foi
        // buscando à FPF: não é aqui que se acrescentam jogos.
        if (!doPassado) continue
        const info = criarJogo.run(
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
        idDoJogo.set(chave, Number(info.lastInsertRowid))
        dataDoJogoPorId.set(Number(info.lastInsertRowid), j.dataHora)
        continue
      }
      idDoJogo.set(chave, existente.id)
      dataDoJogoPorId.set(existente.id, existente.data_hora)
      // A FPF esconde a hora depois do jogo jogado, e fica `T00:00`. O mapa
      // oficial tem-na: preenche-se onde falta, nunca onde já há hora.
      if (doPassado && existente.data_hora?.endsWith('T00:00') && j.dataHora && !j.dataHora.endsWith('T00:00')) {
        reporHora.run(j.dataHora, existente.id)
        resultado.horasRepostas++
      }
    }

    // 5. Nomeações. Aqui o mapa oficial manda: se o jogo tiver outro delegado
    //    nesse papel, é substituído — o que lá está era uma previsão, e isto é
    //    o registo do que aconteceu.
    const delegadoPorNumero = conn.prepare('SELECT id FROM delegado WHERE numero = ?')
    const nomeacaoDoJogo = conn.prepare(
      `SELECT id, delegado_id FROM nomeacao
        WHERE jogo_id = ? AND papel = ? AND estado <> 'CANCELADA'`
    )
    const apagarNomeacao = conn.prepare('DELETE FROM nomeacao WHERE id = ?')
    const criarNomeacao = conn.prepare(
      `INSERT INTO nomeacao
         (jogo_id, delegado_id, papel, km, minutos, fonte_distancia, estado, motivo_override, criado_em)
       VALUES (?, ?, ?, NULL, NULL, NULL, 'CONFIRMADA', NULL, ?)`
    )
    const emFalta = new Set<string>()
    for (const n of NOMEACOES_SEMENTE) {
      const competicaoId = idDaCompeticao.get(n.competicaoFpf)
      if (competicaoId == null) continue
      const jogoId = idDoJogo.get(chaveNatural(competicaoId, n.fixtureId ?? 0, n.casa, n.fora))
      if (jogoId == null) continue
      const delegado = delegadoPorNumero.get(n.delegadoNumero) as { id: number } | undefined
      if (!delegado) {
        emFalta.add(n.delegadoNumero)
        continue
      }
      const atual = nomeacaoDoJogo.get(jogoId, n.papel) as { id: number; delegado_id: number } | undefined
      if (atual?.delegado_id === delegado.id) continue
      const dataDoJogo = (dataDoJogoPorId.get(jogoId) ?? '') as string
      const doPassado = dataDoJogo < INICIO_DA_APLICACAO

      if (!atual) {
        // A FPF já designou alguém, mas isto é do tempo em que o coordenador
        // trabalha na aplicação: não se acrescenta por trás das costas dele.
        if (!doPassado) {
          resultado.nomeacoesIgnoradas++
          continue
        }
        criarNomeacao.run(jogoId, delegado.id, n.papel, agora)
        resultado.nomeacoesCriadas++
        continue
      }

      // Está lá outra pessoa. Só se corrige o engano que esta semente conhece:
      // se entretanto já foi corrigido para um terceiro nome, essa decisão é
      // mais recente do que isto e fica como está.
      const errado = n.substituirNumero
        ? (delegadoPorNumero.get(n.substituirNumero) as { id: number } | undefined)
        : undefined
      if (!errado || errado.id !== atual.delegado_id) {
        resultado.nomeacoesIgnoradas++
        continue
      }
      apagarNomeacao.run(atual.id)
      criarNomeacao.run(jogoId, delegado.id, n.papel, agora)
      resultado.nomeacoesSubstituidas++
    }
    resultado.delegadosEmFalta = [...emFalta]

    conn
      .prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run(CHAVE_CONFIG, VERSAO)
  })
  correr()

  return resultado
}
