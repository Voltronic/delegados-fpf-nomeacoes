import { useEffect, useMemo, useState } from 'react'

/** Linhas por página. Chega para uma jornada inteira sem encher o ecrã. */
export const POR_PAGINA = 25

/**
 * Paginação para as tabelas que crescem com a época.
 *
 * O histórico chega a centenas de linhas ao fim de alguns meses: desenhá-las
 * todas torna o ecrã lento e ilegível. A página volta ao início sempre que o
 * conteúdo muda — senão, filtrar deixava a pessoa numa página que já não existe.
 */
export function usePaginacao<T>(linhas: T[]): {
  pagina: number
  paginas: number
  visiveis: T[]
  irPara: (pagina: number) => void
} {
  const [pagina, setPagina] = useState(1)
  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA))

  useEffect(() => {
    setPagina(1)
  }, [linhas.length])

  const segura = Math.min(pagina, paginas)
  const visiveis = useMemo(
    () => linhas.slice((segura - 1) * POR_PAGINA, segura * POR_PAGINA),
    [linhas, segura]
  )

  return {
    pagina: segura,
    paginas,
    visiveis,
    irPara: (p) => setPagina(Math.min(Math.max(1, p), paginas))
  }
}

interface Props {
  pagina: number
  paginas: number
  total: number
  irPara: (pagina: number) => void
}

export default function Paginacao({ pagina, paginas, total, irPara }: Props): JSX.Element | null {
  // Com uma página só, os controlos não acrescentam nada.
  if (paginas <= 1) return null

  const primeira = (pagina - 1) * POR_PAGINA + 1
  const ultima = Math.min(pagina * POR_PAGINA, total)

  return (
    <div className="paginacao">
      <button className="botao pequeno" disabled={pagina === 1} onClick={() => irPara(pagina - 1)}>
        ‹ Anterior
      </button>
      <span className="silencioso">
        {primeira}–{ultima} de {total}
      </span>
      <button className="botao pequeno" disabled={pagina === paginas} onClick={() => irPara(pagina + 1)}>
        Seguinte ›
      </button>
    </div>
  )
}
