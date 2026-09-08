import { normalizarNome } from '../fpf/html'

/**
 * Recintos cuja localização foi confirmada por quem conhece o terreno.
 *
 * A pesquisa automática falha nestes por razões concretas: uns não existem no
 * OpenStreetMap, outros têm homónimos que ganham (há um "Complexo Desportivo
 * Laranjeiras" em Lisboa e outro em Ponta Delgada; o "Estádio Dois Irmãos" é em
 * Lagoa e não em Faro). Como são recintos das competições nacionais, repetem-se
 * todas as épocas — daí ficarem aqui em vez de terem de ser corrigidos à mão a
 * cada época nova.
 *
 * Entram como confirmados, porque a origem é humana e não uma heurística.
 */
export interface CorrecaoRecinto {
  /** Nome tal como vem da FPF; a comparação é feita já normalizada. */
  nome: string
  lat: number
  lng: number
  descricao: string
}

export const CORRECOES: CorrecaoRecinto[] = [
  {
    nome: 'Campo Nº. 2 Compl. Desp. Prof.Jose Gameiro Sousa Gomes',
    lat: 39.1786874,
    lng: -8.5781276,
    descricao: 'Complexo Desportivo Prof. José Sousa Gomes, Fazendas de Almeirim'
  },
  {
    nome: 'Pavilhao Do Leões Porto Salvo',
    lat: 38.7229328,
    lng: -9.304048,
    descricao: 'Pavilhão Leões Porto Salvo, Oeiras'
  },
  {
    nome: "Pavilhão Do Grupo Nun'álvares",
    lat: 41.4537919,
    lng: -8.1655133,
    descricao: "Grupo Cultural e Recreativo Nun'Álvares, Guimarães"
  },
  {
    nome: 'Campo Da Mata',
    lat: 39.4034078,
    lng: -9.126419,
    descricao: 'Campo da Mata, Caldas da Rainha'
  },
  {
    nome: 'Complexo Desportivo Laranjeiras',
    lat: 37.7470132,
    lng: -25.6510481,
    descricao: 'Complexo Desportivo das Laranjeiras, Ponta Delgada'
  },
  {
    nome: 'Estadio Dois Irmaos',
    lat: 37.1397813,
    lng: -8.5565071,
    descricao: 'Estádio Municipal dos Dois Irmãos, Lagoa'
  },
  {
    nome: 'Campo N.º 1 Centro De Treinos Estádio Cidade De Barcelos',
    lat: 41.552688,
    lng: -8.6233325,
    descricao: 'Centro de Treinos Adelino Ribeiro Novo, Barcelos'
  },
  {
    nome: 'Complexo Desportivo C.F. Fão',
    lat: 41.5030937,
    lng: -8.7696533,
    descricao: 'Complexo Desportivo do Clube de Futebol de Fão, Esposende'
  },
  {
    nome: 'Benfica Campus - Campo Nº1',
    lat: 38.6392999,
    lng: -9.0910377,
    descricao: 'Benfica Campus — Campo n.º 1, Seixal'
  }
]

const POR_NOME = new Map(CORRECOES.map((c) => [normalizarNome(c.nome), c]))

export function correcaoParaRecinto(nome: string): CorrecaoRecinto | undefined {
  return POR_NOME.get(normalizarNome(nome))
}
