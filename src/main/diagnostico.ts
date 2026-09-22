import { app } from 'electron'
import { ClienteFpf } from './fpf/cliente'
import { parseDetalhesCompeticao } from './fpf/parsers'

/**
 * Diagnóstico de uma competição no site da FPF, com o mesmo cliente da
 * aplicação: `npm run diagnostico`.
 *
 * Serve para responder a "o site está a bloquear ou a competição mudou de
 * formato?" sem esperar pela atualização automática — são perguntas diferentes
 * e a mensagem de erro no ecrã não as distingue.
 */
const COMPETICOES: { id: number; nome: string }[] = [
  { id: 29897, nome: 'LIGA FEMININA PLACARD' },
  { id: 29442, nome: 'LIGA 3 PLACARD' },
  { id: 29872, nome: 'LIGA FEMININA SUB-19' }
]
const SEASON = 106

async function principal(): Promise<void> {
  const cliente = new ClienteFpf({ baseUrl: 'https://resultados.fpf.pt', intervaloMs: 900 })
  for (const competicao of COMPETICOES) {
    const inicio = Date.now()
    try {
      const html = await cliente.detalhesCompeticao(competicao.id, SEASON)
      const detalhes = parseDetalhesCompeticao(html)
      const series = detalhes.fases.reduce((n, f) => n + f.series.length, 0)
      const jornadas = detalhes.fases.reduce(
        (n, f) => n + f.series.reduce((m, s) => m + s.jornadas.length, 0),
        0
      )
      console.log(
        `${competicao.nome} (${competicao.id}): ${html.length} bytes, ${detalhes.fases.length} fases, ` +
          `${series} séries, ${jornadas} jornadas — ${Date.now() - inicio} ms` +
          (series === 0 ? '  <<< SEM SÉRIES: é isto que dá o erro no ecrã' : '')
      )
      if (series === 0) {
        const semTags = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        console.log('   início da página:', semTags.slice(0, 200))
      }
    } catch (erro) {
      console.log(`${competicao.nome} (${competicao.id}): FALHOU — ${(erro as Error).message}`)
    }
  }
  console.log(`(recorreu à janela oculta: ${cliente.recorreuAJanela ? 'sim' : 'não'})`)
  app.exit(0)
}

void app.whenReady().then(principal)
