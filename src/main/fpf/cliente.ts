import { BrowserWindow, net } from 'electron'

/**
 * Cliente HTTP para o Centro de Resultados da FPF.
 *
 * Três cuidados que não são opcionais:
 *  - o site está atrás de Cloudflare e responde 403 a pedidos sem cabeçalhos de
 *    browser, pelo que se usa o `net` do Electron (stack de rede do Chromium)
 *    com o conjunto completo de cabeçalhos, incluindo os `Sec-Fetch-*`, que na
 *    prática são o que distingue um pedido aceite de um recusado;
 *  - quando mesmo assim vem 403, recorre-se a uma navegação real numa janela
 *    oculta, que passa sempre — é o plano B que impede a importação de encalhar;
 *  - os pedidos são serializados com um intervalo mínimo, para não martelar um
 *    site público durante uma sincronização de centenas de jornadas.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export class ErroHttp extends Error {
  constructor(
    readonly estado: number,
    readonly url: string
  ) {
    super(
      estado === 403 || estado === 429
        ? `O site da FPF recusou o pedido (HTTP ${estado}). Costuma ser um travão temporário — espere um minuto e tente de novo.`
        : `HTTP ${estado} em ${url}`
    )
    this.name = 'ErroHttp'
  }
}

export interface OpcoesCliente {
  baseUrl: string
  /** Intervalo mínimo entre pedidos, em milissegundos. */
  intervaloMs?: number
  tentativas?: number
}

export class ClienteFpf {
  private readonly baseUrl: string
  private readonly intervaloMs: number
  private readonly tentativas: number
  private fila: Promise<unknown> = Promise.resolve()
  private ultimoPedido = 0
  private janela: BrowserWindow | null = null
  private usouJanela = false

  constructor(opcoes: OpcoesCliente) {
    this.baseUrl = opcoes.baseUrl.replace(/\/$/, '')
    this.intervaloMs = opcoes.intervaloMs ?? 900
    this.tentativas = opcoes.tentativas ?? 3
  }

  /** Serializa os pedidos e garante o intervalo mínimo entre eles. */
  private agendar<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = this.fila.then(async () => {
      const espera = this.intervaloMs - (Date.now() - this.ultimoPedido)
      if (espera > 0) await new Promise((r) => setTimeout(r, espera))
      try {
        return await tarefa()
      } finally {
        this.ultimoPedido = Date.now()
      }
    })
    this.fila = resultado.catch(() => undefined)
    return resultado
  }

  private pedir(caminho: string): Promise<string> {
    const url = caminho.startsWith('http') ? caminho : `${this.baseUrl}${caminho}`
    const eIndice = caminho === '/Competition'
    return new Promise((resolve, reject) => {
      const pedido = net.request({ method: 'GET', url, redirect: 'follow' })
      pedido.setHeader('User-Agent', UA)
      pedido.setHeader(
        'Accept',
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      )
      pedido.setHeader('Accept-Language', 'pt-PT,pt;q=0.9,en;q=0.8')
      pedido.setHeader('Sec-Fetch-Dest', 'document')
      pedido.setHeader('Sec-Fetch-Mode', 'navigate')
      pedido.setHeader('Sec-Fetch-Site', eIndice ? 'none' : 'same-origin')
      pedido.setHeader('Upgrade-Insecure-Requests', '1')
      if (!eIndice) pedido.setHeader('Referer', `${this.baseUrl}/Competition`)

      pedido.on('response', (resposta) => {
        const pedacos: Buffer[] = []
        resposta.on('data', (p) => pedacos.push(Buffer.from(p)))
        resposta.on('end', () => {
          const corpo = Buffer.concat(pedacos).toString('utf-8')
          if (resposta.statusCode >= 200 && resposta.statusCode < 300) resolve(corpo)
          else reject(new ErroHttp(resposta.statusCode, url))
        })
        resposta.on('error', reject)
      })
      pedido.on('error', reject)
      pedido.end()
    })
  }

  /**
   * Recurso quando o Cloudflare recusa o pedido direto: carrega o URL numa
   * janela oculta, que é uma navegação de Chromium a sério e passa sempre. É
   * mais lento, por isso só se usa em último caso — mas garante que a
   * importação nunca fica bloqueada por causa da proteção do site.
   */
  private async pedirViaJanela(url: string): Promise<string> {
    if (!this.janela || this.janela.isDestroyed()) {
      this.janela = new BrowserWindow({
        show: false,
        webPreferences: { javascript: true, images: false }
      })
    }
    await this.janela.loadURL(url)
    return (await this.janela.webContents.executeJavaScript(
      'document.documentElement.outerHTML'
    )) as string
  }

  async obter(caminho: string): Promise<string> {
    const url = caminho.startsWith('http') ? caminho : `${this.baseUrl}${caminho}`
    return this.agendar(async () => {
      let ultimoErro: unknown
      for (let tentativa = 1; tentativa <= this.tentativas; tentativa++) {
        try {
          return await this.pedir(caminho)
        } catch (erro) {
          ultimoErro = erro
          const travado = erro instanceof ErroHttp && (erro.estado === 403 || erro.estado === 429)
          if (travado) {
            try {
              const html = await this.pedirViaJanela(url)
              this.usouJanela = true
              return html
            } catch (erroJanela) {
              ultimoErro = erroJanela
            }
          }
          if (tentativa >= this.tentativas) break
          await new Promise((r) => setTimeout(r, travado ? 3000 * tentativa : 1000 * tentativa))
        }
      }
      throw ultimoErro
    })
  }

  /** Verdadeiro se alguma leitura precisou de recorrer à janela oculta. */
  get recorreuAJanela(): boolean {
    return this.usouJanela
  }

  fechar(): void {
    if (this.janela && !this.janela.isDestroyed()) this.janela.destroy()
    this.janela = null
  }

  indiceCompeticoes(): Promise<string> {
    return this.obter('/Competition')
  }

  organizacoesPorEpoca(seasonId: number): Promise<string> {
    return this.obter(`/Competition/GetOrganizationsByFilter?SeasonId=${seasonId}`)
  }

  competicoesPorAssociacao(associationId: number, seasonId: number): Promise<string> {
    return this.obter(
      `/Competition/GetCompetitionsByAssociation?associationId=${associationId}&seasonId=${seasonId}`
    )
  }

  detalhesCompeticao(competitionId: number, seasonId: number): Promise<string> {
    return this.obter(`/Competition/Details?competitionId=${competitionId}&seasonId=${seasonId}`)
  }

  jogosDaJornada(fixtureId: number): Promise<string> {
    return this.obter(`/Competition/GetClassificationAndMatchesByFixture?fixtureId=${fixtureId}`)
  }

  infoJogo(matchId: number): Promise<string> {
    return this.obter(`/Match/GetMatchInformation?matchId=${matchId}`)
  }
}
