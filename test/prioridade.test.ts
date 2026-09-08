import { describe, expect, it } from 'vitest'

/**
 * A fila do Nominatim serve tanto a geocodificação em lote (centenas de
 * pedidos automáticos) como as pesquisas que o coordenador faz à mão. Sem
 * prioridade, uma pesquisa feita durante um lote esperava minutos e a
 * aplicação parecia pendurada.
 *
 * A lógica de inserção é reproduzida aqui para poder ser testada sem tocar na
 * rede nem no relógio.
 */
interface Pedido {
  id: string
  prioritario: boolean
}

function inserir(fila: Pedido[], pedido: Pedido): Pedido[] {
  if (!pedido.prioritario) return [...fila, pedido]
  const posicao = fila.findIndex((p) => !p.prioritario)
  if (posicao === -1) return [...fila, pedido]
  return [...fila.slice(0, posicao), pedido, ...fila.slice(posicao)]
}

const auto = (id: string): Pedido => ({ id, prioritario: false })
const utilizador = (id: string): Pedido => ({ id, prioritario: true })

describe('prioridade na fila de geocodificação', () => {
  it('uma pesquisa do utilizador passa à frente dos pedidos automáticos', () => {
    let fila: Pedido[] = [auto('lote1'), auto('lote2'), auto('lote3')]
    fila = inserir(fila, utilizador('eu'))
    expect(fila.map((p) => p.id)).toEqual(['eu', 'lote1', 'lote2', 'lote3'])
  })

  it('não ultrapassa outras pesquisas do utilizador já em espera', () => {
    let fila: Pedido[] = [utilizador('eu1'), auto('lote1')]
    fila = inserir(fila, utilizador('eu2'))
    expect(fila.map((p) => p.id)).toEqual(['eu1', 'eu2', 'lote1'])
  })

  it('os automáticos mantêm a ordem de chegada', () => {
    let fila: Pedido[] = []
    fila = inserir(fila, auto('a'))
    fila = inserir(fila, auto('b'))
    fila = inserir(fila, auto('c'))
    expect(fila.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('numa fila só de pesquisas do utilizador, respeita a ordem', () => {
    let fila: Pedido[] = [utilizador('a'), utilizador('b')]
    fila = inserir(fila, utilizador('c'))
    expect(fila.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('funciona com a fila vazia', () => {
    expect(inserir([], utilizador('eu')).map((p) => p.id)).toEqual(['eu'])
    expect(inserir([], auto('lote')).map((p) => p.id)).toEqual(['lote'])
  })
})
