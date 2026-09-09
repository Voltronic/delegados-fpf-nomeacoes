import { useEffect, useState } from 'react'
import { subscreverAvisos, type Aviso } from '../lib/avisos'

/** Quanto tempo cada aviso fica no ecrã. Os erros ficam mais, para dar tempo de ler. */
const DURACAO = { sucesso: 3500, erro: 8000 }

/** Com botão de desfazer fica mais tempo: é preciso reparar e decidir. */
const DURACAO_COM_ACCAO = 9000

export default function Avisos(): JSX.Element {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  useEffect(() => {
    return subscreverAvisos((aviso) => {
      setAvisos((atuais) => [...atuais, aviso])
      setTimeout(
        () => setAvisos((atuais) => atuais.filter((a) => a.id !== aviso.id)),
        aviso.accao ? DURACAO_COM_ACCAO : DURACAO[aviso.tipo]
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
          {aviso.accao && (
            <button
              className="anular"
              onClick={(e) => {
                // Sem isto, o clique fechava o aviso pelo `onClick` do cartão
                // antes de a ação chegar a correr.
                e.stopPropagation()
                setAvisos((atuais) => atuais.filter((a) => a.id !== aviso.id))
                void aviso.accao?.executar()
              }}
            >
              {aviso.accao.etiqueta}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
