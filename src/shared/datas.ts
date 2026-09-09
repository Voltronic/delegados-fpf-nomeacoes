/**
 * Contas com datas partilhadas entre o processo principal e a interface.
 *
 * As datas dos jogos são texto ISO local (`2026-09-13T15:00`), sem fuso: é o
 * que a FPF publica e o que se guarda. Todas as contas aqui tratam disso como
 * hora local, que é como o coordenador a lê.
 */

/**
 * Lê uma data guardada (`YYYY-MM-DD` ou `YYYY-MM-DDTHH:mm`) como hora local.
 *
 * `new Date(texto)` não serve: uma data **com** hora é lida como local, mas uma
 * data **sem** hora é lida como UTC. Num computador a oeste de Greenwich — nos
 * Açores, por exemplo — isso punha o jogo no dia anterior. Aqui os números são
 * usados tal como estão escritos, no fuso de quem está a usar a aplicação.
 */
export function paraDataLocal(texto: string | null): Date | null {
  if (!texto) return null
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(texto.trim())
  if (!partes) return null
  const [, ano, mes, dia, hora, minuto] = partes
  return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora ?? 0), Number(minuto ?? 0))
}

/**
 * Dias de calendário até uma data: 0 é hoje, 1 é amanhã, negativo é passado.
 *
 * Conta de meia-noite a meia-noite, e não de horas. Comparar a hora do jogo com
 * o início de hoje dava 17 horas para um jogo hoje às 17:00, que arredondado
 * virava "amanhã" — e sexta-feira aparecia como três dias em vez de dois.
 *
 * O "hoje" é sempre o do relógio do computador: quem abrir a aplicação nos
 * Açores conta os dias pela hora dos Açores.
 */
export function diasAte(dataHora: string | null, agora = new Date()): number | null {
  const dia = paraDataLocal(dataHora)
  if (!dia) return null
  dia.setHours(0, 0, 0, 0)
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  // `round` e não `floor`: as mudanças para a hora de verão fazem os dias ter
  // 23 ou 25 horas, e sem isto a contagem escorregava um dia nessas semanas.
  return Math.round((dia.getTime() - hoje.getTime()) / 86_400_000)
}

/**
 * A hora que a FPF não diz é escrita como `T00:00`. Nenhum jogo destas
 * competições começa à meia-noite, por isso essa hora significa sempre "ainda
 * não se sabe" — e nunca deve apagar uma hora que já se conhecia.
 */
export function horaDesconhecida(dataHora: string | null): boolean {
  return !!dataHora && dataHora.endsWith('T00:00')
}

/**
 * Que data guardar quando chega uma atualização.
 *
 * Quando um jogo é jogado, a página da FPF passa a mostrar o resultado em vez
 * da hora, e a leitura devolve `T00:00`. Aceitar isso apagava a hora real do
 * jogo — foi o que aconteceu a um Santa Clara × Farense, que passou de 12:00
 * para 00:00 sozinho. No mesmo dia, mantém-se a hora que já se conhecia; se o
 * jogo mudou mesmo de dia, aceita-se a data nova como está.
 */
export function dataHoraAGuardar(anterior: string | null, nova: string | null): string | null {
  if (!nova || !anterior) return nova
  const mesmoDia = anterior.slice(0, 10) === nova.slice(0, 10)
  if (horaDesconhecida(nova) && mesmoDia && !horaDesconhecida(anterior)) return anterior
  return nova
}

/**
 * Se a data de um jogo mudou mesmo, para efeitos de aviso ao coordenador.
 *
 * É a mesma regra de `dataHoraAGuardar`, de propósito: avisar de uma alteração
 * que não chega a ser gravada é ruído. Foi o que aconteceu com os jogos já
 * realizados — o alerta dizia que a hora tinha mudado quando a hora ficava
 * exatamente na mesma.
 */
export function dataMudou(anterior: string | null, novaDaFpf: string | null): boolean {
  return (anterior ?? null) !== (dataHoraAGuardar(anterior, novaDaFpf) ?? null)
}
