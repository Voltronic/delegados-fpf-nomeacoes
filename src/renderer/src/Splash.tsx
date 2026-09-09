import { BANNER_FPF } from './components/Marca'

/**
 * O que se vê enquanto a aplicação arranca.
 *
 * O arranque abre a base de dados, aplica migrações em falta e grava uma cópia
 * de segurança — em bases de dados com uma época inteira isso demora o
 * suficiente para parecer que nada aconteceu ao fazer duplo clique. Esta janela
 * é a resposta a esse silêncio.
 */
export default function Splash(): JSX.Element {
  return (
    <div className="splash">
      {BANNER_FPF ? (
        <img src={BANNER_FPF} alt="Federação Portuguesa de Futebol" />
      ) : (
        <div className="marca-texto">
          <b>Nomeações de Delegados</b>
          <span>Competições nacionais FPF</span>
        </div>
      )}
      <div className="a-abrir">A abrir…</div>
    </div>
  )
}
