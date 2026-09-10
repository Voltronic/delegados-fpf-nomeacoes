import { BrowserWindow } from 'electron'
import type {
  Alerta,
  DiffJogo,
  JogoDetalhado,
  ProgressoSincronizacao,
  ResultadoAtualizacao
} from '@shared/tipos'
import { escreverConfig, lerConfig } from '../db'
import * as repos from '../db/repos'
import type { EntradaAlerta } from '../db/repos'
import { ClienteFpf } from '../fpf/cliente'
import { chavesPendentes, sincronizar } from '../fpf/sincronizacao'
import { geocodificarRecintosEmFalta } from '../geo/lote'
import { obterConfiguracaoMotor } from '../engine/servico'

const INTERVALO_MS = 60 * 60 * 1000

let temporizador: NodeJS.Timeout | null = null
let aCorrer = false
let ultimaAtualizacao: ResultadoAtualizacao | null = null

function hojeIso(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function descreverJogo(j: { clubeCasaNome: string; clubeForaNome: string }): string {
  return `${j.clubeCasaNome} × ${j.clubeForaNome}`
}

function nomesDosDelegados(jogo: JogoDetalhado): string {
  return jogo.nomeacoes
    .map((n) => `${n.delegadoNome} (${n.papel === 'PRINCIPAL' ? 'principal' : 'campo'})`)
    .join(' e ')
}

function formatarData(iso: string | null): string {
  if (!iso) return 'sem data'
  const [data, hora] = iso.split('T')
  const [a, m, d] = data.split('-')
  return `${d}/${m}/${a}${hora && hora !== '00:00' ? ` às ${hora}` : ''}`
}

/**
 * Alertas para os jogos alterados que já têm delegado nomeado. A alteração já
 * foi aplicada — o alerta é o que garante que o coordenador não descobre o
 * adiamento tarde de mais.
 */
function alertasDeAlteracao(diffs: DiffJogo[]): EntradaAlerta[] {
  const entradas: EntradaAlerta[] = []
  for (const d of diffs) {
    if (!d.jogoId) continue
    const jogo = repos.obterJogoDetalhado(d.jogoId)
    if (!jogo) continue

    const mudancas = d.alteracoes
      .map((a) => {
        if (a.campo === 'Data e hora') return `data passou de ${formatarData(a.antes)} para ${formatarData(a.depois)}`
        return `${a.campo.toLowerCase()} passou de "${a.antes ?? '—'}" para "${a.depois ?? '—'}"`
      })
      .join('; ')

    entradas.push({
      // A chave inclui o que mudou: se mudar outra vez, gera novo alerta.
      chave: `alterado:${d.chaveNatural}:${d.dataHora ?? ''}:${d.recinto ?? ''}`,
      tipo: 'ALTERADO',
      jogoId: d.jogoId,
      competicao: d.competicaoNome,
      descricao: descreverJogo(jogo),
      dataHora: d.dataHora,
      detalhe: `${mudancas}. Nomeado: ${nomesDosDelegados(jogo)}.`
    })
  }
  return entradas
}

/**
 * Alertas de conflito: um jogo mudou de data e o delegado que lá está nomeado
 * já tem outro jogo nessa altura. Ninguém está em dois sítios ao mesmo tempo.
 */
function alertasDeConflito(diffs: DiffJogo[]): EntradaAlerta[] {
  const margem = obterConfiguracaoMotor().margemEntreJogosMinutos
  const entradas: EntradaAlerta[] = []

  for (const d of diffs) {
    const mudouData = d.alteracoes.some((a) => a.campo === 'Data e hora')
    if (!d.jogoId || !d.dataHora || !mudouData) continue
    const jogo = repos.obterJogoDetalhado(d.jogoId)
    if (!jogo) continue

    for (const nomeacao of jogo.nomeacoes) {
      const colisoes = repos.jogosDoDelegadoPerto(nomeacao.delegadoId, d.dataHora, margem, d.jogoId)
      for (const outro of colisoes) {
        entradas.push({
          chave: `conflito:${d.chaveNatural}:${nomeacao.delegadoId}:${outro.id}:${d.dataHora}`,
          tipo: 'CONFLITO',
          jogoId: d.jogoId,
          competicao: d.competicaoNome,
          descricao: descreverJogo(jogo),
          dataHora: d.dataHora,
          detalhe:
            `${nomeacao.delegadoNome} está nomeado para este jogo, que passou para ${formatarData(d.dataHora)}, ` +
            `mas já tem ${descreverJogo(outro)} em ${formatarData(outro.dataHora)}. É preciso libertar um dos dois.`
        })
      }
    }
  }
  return entradas
}

/**
 * Jogos que estavam guardados e deixaram de aparecer no site.
 *
 * Só se avalia nas competições lidas por inteiro (estrutura e todas as
 * jornadas). Se uma única jornada falhar, os seus jogos ficam de fora do
 * resultado e pareceriam cancelados — um falso alarme é bem pior do que um
 * aviso que só chega na atualização seguinte.
 */
function alertasDeDesaparecidos(competicoesLidas: number[], desde: string): EntradaAlerta[] {
  const vistas = chavesPendentes()
  const entradas: EntradaAlerta[] = []

  for (const competicaoId of competicoesLidas) {
    for (const jogo of repos.jogosFuturosDaCompeticao(competicaoId, desde)) {
      // Jogos criados à mão não vêm do site e nunca "desaparecem".
      if (jogo.fpfFixtureId == null || vistas.has(jogo.chaveNatural)) continue
      entradas.push({
        chave: `desaparecido:${jogo.chaveNatural}`,
        tipo: 'DESAPARECIDO',
        jogoId: jogo.id,
        competicao: jogo.competicaoNome,
        descricao: descreverJogo(jogo),
        dataHora: jogo.dataHora,
        detalhe:
          `Deixou de aparecer no site da FPF (estava marcado para ${formatarData(jogo.dataHora)}). ` +
          (jogo.nomeacoes.length
            ? `Pode ter sido adiado ou cancelado — está nomeado ${nomesDosDelegados(jogo)}.`
            : 'Pode ter sido adiado ou cancelado.')
      })
    }
  }
  return entradas
}

/**
 * Atualiza os jogos futuros das competições ativas. Jogos inalterados não são
 * tocados; o que muda gera alerta para o coordenador.
 */
export async function atualizarJogos(
  cliente: ClienteFpf,
  progresso: (p: ProgressoSincronizacao) => void = () => undefined
): Promise<ResultadoAtualizacao> {
  const desde = hojeIso()
  const competicoes = repos.listarCompeticoes().filter((c) => c.ativa && c.fpfCompetitionId != null)

  const resultado: ResultadoAtualizacao = {
    quando: new Date().toISOString(),
    criados: 0,
    atualizados: 0,
    alertas: [],
    erros: [],
    recintosLocalizados: 0,
    recintosPorLocalizar: 0,
    recintosPorConfirmar: 0
  }
  // Uma sincronização por época, porque o seasonId faz parte do pedido.
  const porEpoca = new Map<number, typeof competicoes>()
  for (const c of competicoes) {
    porEpoca.set(c.seasonId, [...(porEpoca.get(c.seasonId) ?? []), c])
  }

  const entradas: EntradaAlerta[] = []

  for (const [seasonId, lista] of porEpoca) {
    const sincronizacao = await sincronizar(
      cliente,
      {
        seasonId,
        descricaoEpoca: lista.find((c) => c.seasonDescricao)?.seasonDescricao ?? '',
        organizacao: lista[0].organizacao ?? '',
        desde,
        competicoes: lista.map((c) => ({
          competitionId: c.fpfCompetitionId!,
          nome: c.nome,
          nivelMinimo: c.nivelMinimo,
          usaDelegadoCampo: c.usaDelegadoCampo
        }))
      },
      progresso
    )

    resultado.criados += sincronizacao.criados
    resultado.atualizados += sincronizacao.atualizados
    resultado.erros.push(...sincronizacao.erros)

    entradas.push(...alertasDeConflito(sincronizacao.sensiveis))
    entradas.push(...alertasDeAlteracao(sincronizacao.sensiveis))
    entradas.push(
      ...alertasDeDesaparecidos(
        sincronizacao.competicoes.filter((c) => c.lida).map((c) => c.id),
        desde
      )
    )
  }

  // Os alertas dos recintos são calculados depois da geocodificação, mais
  // abaixo: só interessam os que ficaram mesmo sem coordenadas.
  resultado.alertas = repos.criarAlertas(entradas)

  // Um recinto sem coordenadas não tem distâncias, e sem distâncias o motor não
  // ordena ninguém — não faz sentido deixar isto à espera de alguém se lembrar
  // de carregar num botão. Cada recinto só é procurado uma vez.
  if (repos.recintosSemCoordenadas().length) {
    const geo = await geocodificarRecintosEmFalta((p) =>
      progresso({
        etapa: p.recinto ? `A localizar recintos — ${p.recinto}` : 'Recintos',
        atual: p.atual,
        total: p.total,
        concluido: p.concluido
      })
    )
    resultado.recintosLocalizados = geo.localizados
    resultado.recintosPorLocalizar = geo.falhados.length
    resultado.recintosPorConfirmar = geo.porConfirmar
  }

  // Um recinto novo que a pesquisa não conseguiu localizar tem de dar nas
  // vistas: sem coordenadas não há distâncias, e sem distâncias os jogos desse
  // recinto ficam sem candidatos ordenados. O alerta fecha-se sozinho quando
  // alguém puser a localização.
  repos.apagarAlertasDeRecintosLocalizados()
  resultado.alertas.push(...repos.criarAlertas(repos.alertasDeRecintosSemCoordenadas()))

  ultimaAtualizacao = resultado
  // Guardado em base de dados, e não só em memória: ao abrir a aplicação o
  // coordenador tem de saber de quando são os dados que está a ver, mesmo antes
  // de a primeira atualização do dia terminar — ou se estiver sem rede.
  escreverConfig('sync.ultimaEm', resultado.quando)
  return resultado
}

function emitir(canal: string, dados: unknown): void {
  for (const janela of BrowserWindow.getAllWindows()) {
    if (!janela.isDestroyed()) janela.webContents.send(canal, dados)
  }
}

/**
 * Arranca a atualização periódica: uma vez ao arrancar e depois de hora a hora.
 * Nunca corre duas ao mesmo tempo, e uma falha não mata o ciclo.
 */
export function iniciarAgendador(cliente: () => ClienteFpf): void {
  const correr = async (): Promise<void> => {
    if (aCorrer) return
    if (lerConfig('sync.automatico') === 'false') return
    aCorrer = true
    try {
      const resultado = await atualizarJogos(cliente(), (p) => emitir('fpf:progresso', p))
      emitir('sync:concluida', resultado)
      if (resultado.alertas.length) emitir('alertas:novos', resultado.alertas)
    } catch (erro) {
      console.error('Atualização automática falhou:', erro)
      emitir('sync:concluida', {
        quando: new Date().toISOString(),
        criados: 0,
        atualizados: 0,
        alertas: [],
        erros: [(erro as Error).message],
        recintosLocalizados: 0,
        recintosPorLocalizar: 0,
        recintosPorConfirmar: 0
      } satisfies ResultadoAtualizacao)
    } finally {
      aCorrer = false
    }
  }

  // Um pequeno atraso no arranque para não competir com o desenho da janela.
  setTimeout(() => void correr(), 8000)
  temporizador = setInterval(() => void correr(), INTERVALO_MS)
}

export function pararAgendador(): void {
  if (temporizador) clearInterval(temporizador)
  temporizador = null
}

export function estadoAtualizacao(): {
  aCorrer: boolean
  ultima: ResultadoAtualizacao | null
  ultimaEm: string | null
} {
  return {
    aCorrer,
    ultima: ultimaAtualizacao,
    // Vale a de memória se houve atualização nesta sessão; senão, a que ficou
    // guardada da última vez que a aplicação esteve aberta.
    ultimaEm: ultimaAtualizacao?.quando ?? lerConfig('sync.ultimaEm')
  }
}

export type { Alerta }
