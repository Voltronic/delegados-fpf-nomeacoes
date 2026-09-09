/**
 * As imagens da FPF, quando existirem.
 *
 * Ficam em `src/renderer/src/assets/` e são opcionais de propósito: quem clona
 * o repositório sem elas continua a conseguir compilar, e a aplicação mostra só
 * o nome. `import.meta.glob` devolve um objeto vazio quando não há ficheiro, ao
 * contrário de um `import` normal, que rebentaria a compilação.
 */
const bandeiras = import.meta.glob('../assets/fpf-banner.*', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const emblemas = import.meta.glob('../assets/fpf-emblema.*', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

export const BANNER_FPF: string | null = Object.values(bandeiras)[0] ?? null
export const EMBLEMA_FPF: string | null = Object.values(emblemas)[0] ?? null

/**
 * O emblema pequeno que acompanha o nome da aplicação nos ecrãs.
 *
 * Só se fixa a altura: o emblema é mais alto do que largo (374×500), e impor um
 * quadrado achatava-o.
 */
export function Emblema({ altura = 30 }: { altura?: number }): JSX.Element | null {
  if (!EMBLEMA_FPF) return null
  return (
    <img
      className="emblema-fpf"
      src={EMBLEMA_FPF}
      height={altura}
      alt="Federação Portuguesa de Futebol"
    />
  )
}
