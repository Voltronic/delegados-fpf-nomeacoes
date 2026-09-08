import type { ProgressoGeocodificacao, ResultadoGeocodificacaoLote } from '@shared/tipos'
import * as repos from '../db/repos'
import { geocodificar, invalidarCache } from './index'
import { consultasParaRecinto } from './consultas'
import { escolherCoordenada, type CandidatoCoordenada } from './escolha'
import { recintoConhecido } from './recintosConhecidos'

/**
 * Localiza de uma vez todos os recintos que ainda não têm ponto no mapa.
 *
 * Faz todas as pesquisas de cada recinto — nome, nome simplificado, clube — e só
 * depois decide, por consenso. Ficar-se pela primeira resposta era o que punha
 * "Campo Manuel Marques" na Madeira quando o clube é de Torres Vedras.
 *
 * O Nominatim aceita um pedido por segundo, por isso isto demora minutos. Nada
 * do que sai daqui é dado como certo: fica tudo por confirmar, porque um recinto
 * no sítio errado corrompe em silêncio todos os quilómetros.
 */
export async function geocodificarRecintosEmFalta(
  progresso: (p: ProgressoGeocodificacao) => void = () => undefined
): Promise<ResultadoGeocodificacaoLote> {
  const emFalta = repos.recintosSemCoordenadas()
  const falhados: ResultadoGeocodificacaoLote['falhados'] = []
  const porConfianca = { alta: 0, media: 0, baixa: 0 }
  let localizados = 0
  let corrigidos = 0

  for (let i = 0; i < emFalta.length; i++) {
    const recinto = emFalta[i]
    progresso({ atual: i + 1, total: emFalta.length, recinto: recinto.nome, concluido: false })

    // Recintos já confirmados ganham a qualquer pesquisa: não há heurística
    // que bata alguém que sabe onde é o campo.
    const correcao = recintoConhecido(recinto.nome)
    if (correcao) {
      repos.atualizarRecinto(recinto.id, {
        nome: recinto.nome,
        morada: recinto.morada ?? correcao.descricao,
        lat: correcao.lat,
        lng: correcao.lng,
        coordsManuais: true
      })
      invalidarCache({ recintoId: recinto.id })
      localizados++
      corrigidos++
      continue
    }

    const candidatos: CandidatoCoordenada[] = []
    for (const consulta of consultasParaRecinto(recinto.nome, recinto.morada, recinto.clubes ?? [])) {
      try {
        const resultado = await geocodificar(consulta.termo)
        if (!resultado) continue
        candidatos.push({
          lat: resultado.lat,
          lng: resultado.lng,
          origem: consulta.origem,
          moradaResolvida: resultado.moradaResolvida,
          categoria: resultado.categoria,
          fiavel: consulta.fiavel
        })
      } catch (erro) {
        // Uma falha de rede numa pesquisa não impede as restantes.
        console.warn(`Geocodificação falhou para "${consulta.termo}":`, erro)
      }
    }

    const escolha = escolherCoordenada(candidatos)
    if (!escolha) {
      falhados.push({ id: recinto.id, nome: recinto.nome, clubes: recinto.clubes ?? [] })
      continue
    }

    repos.guardarCoordenadasAutomaticas(recinto.id, {
      lat: escolha.candidato.lat,
      lng: escolha.candidato.lng,
      origem: escolha.candidato.origem,
      moradaResolvida: escolha.candidato.moradaResolvida,
      confianca: escolha.confianca
    })
    invalidarCache({ recintoId: recinto.id })
    localizados++
    if (escolha.confianca === 'ALTA') porConfianca.alta++
    else if (escolha.confianca === 'MEDIA') porConfianca.media++
    else porConfianca.baixa++
  }

  progresso({ atual: emFalta.length, total: emFalta.length, recinto: '', concluido: true })

  return {
    localizados,
    corrigidos,
    porConfirmar: repos.listarRecintos().filter((r) => r.lat != null && !r.confirmado).length,
    porConfianca,
    falhados
  }
}
