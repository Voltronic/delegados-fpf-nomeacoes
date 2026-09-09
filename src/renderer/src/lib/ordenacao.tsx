import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { classes } from './formato'

/**
 * Ordenação de tabelas por coluna.
 *
 * As tabelas do dashboard e das listagens são para ler à procura de alguma
 * coisa — quem tem mais km, quem ainda não fez determinado clube, que jogos
 * faltam. Poder ordenar por qualquer coluna é o que torna isso rápido.
 */
export type Sentido = 'asc' | 'desc'

export interface Ordem<C extends string> {
  coluna: C
  sentido: Sentido
}

/** Como se extrai de cada linha o valor de cada coluna ordenável. */
export type Valores<T, C extends string> = Record<C, (linha: T) => string | number | null>

function comparar(a: string | number | null, b: string | number | null): number {
  // Linhas sem valor ficam sempre no fim, seja qual for o sentido: uma célula
  // vazia não é "a menor", é uma ausência.
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  // `localeCompare` com o locale português para os acentos não irem para o fim.
  return String(a).localeCompare(String(b), 'pt-PT', { numeric: true, sensitivity: 'base' })
}

export function useOrdenacao<T, C extends string>(
  linhas: T[],
  valores: Valores<T, C>,
  // `NoInfer` para as colunas virem de `valores` e não da ordem inicial: sem
  // isto, `{ coluna: 'km' }` estreitava o tipo a essa única coluna.
  inicial: Ordem<NoInfer<C>>
): { ordenadas: T[]; ordem: Ordem<C>; alternar: (coluna: C) => void } {
  const [ordem, setOrdem] = useState<Ordem<C>>(inicial as Ordem<C>)

  const ordenadas = useMemo(() => {
    const extrair = valores[ordem.coluna]
    if (!extrair) return linhas
    const sinal = ordem.sentido === 'asc' ? 1 : -1
    // `slice` porque `sort` altera o array recebido, que é o estado de quem nos usa.
    return linhas.slice().sort((a, b) => comparar(extrair(a), extrair(b)) * sinal)
  }, [linhas, valores, ordem])

  /** Clicar na coluna atual inverte o sentido; noutra, começa ascendente. */
  const alternar = (coluna: C): void =>
    setOrdem((atual) =>
      atual.coluna === coluna
        ? { coluna, sentido: atual.sentido === 'asc' ? 'desc' : 'asc' }
        : { coluna, sentido: 'asc' }
    )

  return { ordenadas, ordem, alternar }
}

interface PropsColuna<C extends string> {
  coluna: C
  ordem: Ordem<C>
  alternar: (coluna: C) => void
  children: ReactNode
  className?: string
  style?: CSSProperties
  title?: string
}

/** Cabeçalho de coluna que ordena ao ser clicado. */
export function ColunaOrdenavel<C extends string>({
  coluna,
  ordem,
  alternar,
  children,
  className,
  style,
  title
}: PropsColuna<C>): JSX.Element {
  const ativa = ordem.coluna === coluna
  return (
    <th
      className={classes('ordenavel', ativa && 'ordenada', className)}
      style={style}
      title={title}
      aria-sort={ativa ? (ordem.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => alternar(coluna)}
    >
      {children}
      <span className="seta" aria-hidden>
        {ativa ? (ordem.sentido === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  )
}
