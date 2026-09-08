import { useEffect, useState } from 'react'
import { subscreverAvisos, type Aviso } from '../lib/avisos'

/** Quanto tempo cada aviso fica no ecrã. Os erros ficam mais, para dar tempo de ler. */
const DURACAO = { sucesso: 3500, erro: 8000 }

export default function Avisos(): JSX.Element {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  useEffect(() => {
    return subscreverAvisos((aviso) => {
      setAvisos((atuais) => [...atuais, aviso])
      setTimeout(
        () => setAvisos((atuais) => atuais.filter((a) => a.id !== aviso.id)),
        DURACAO[aviso.tipo]
      )
    })
  }, [])

  if (!avisos.length) return <></>

  return (
    <div className="avisos" role="status" aria-live="polite">
      {avisos.map((aviso) => (
        <div
          key={aviso.id}
          className={`toast ${aviso.tipo}`}
          onClick={() => setAvisos((atuais) => atuais.filter((a) => a.id !== aviso.id))}
          title="Carregue para fechar"
        >
          <span className="icone" aria-hidden>
            {aviso.tipo === 'sucesso' ? '✓' : '!'}
          </span>
          <span>{aviso.texto}</span>
        </div>
      ))}
    </div>
  )
}
