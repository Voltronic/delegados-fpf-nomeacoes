# Nomeações de Delegados — FPF

Aplicação Windows para o coordenador de delegados das competições nacionais da FPF. Carrega os jogos
automaticamente do Centro de Resultados da FPF, sugere delegados por ordem de prioridade e mantém o
registo de quilómetros para que, no fim da época, todos tenham feito mais ou menos o mesmo.

A aplicação corre a partir de uma pasta — sem instalação, sem base de dados externa, sem dependências
no computador do coordenador.

---

## O que faz

**Ecrã de nomeações** (onde se passa o trabalho) — três painéis:

- **Jogos da semana**, com filtros por competição, texto e estado (por nomear / parcial / completo).
- **Candidatos** ordenados por prioridade. Cada cartão mostra os km da época com barra comparativa
  face à média, os km desta viagem (ida e volta), quantas vezes já fez aqueles clubes, e uma
  pontuação que se pode abrir para ver a decomposição critério a critério.
  Os não elegíveis ficam numa secção à parte, com o motivo — e podem sempre ser forçados.
- **Mapa** com o recinto e os delegados, coloridos pela posição no ranking. Passar o rato num cartão
  realça o pino, e vice-versa.

**Modo automático**: gera uma proposta para todos os jogos filtrados, tratando primeiro os mais
difíceis de preencher e recalculando o equilíbrio de km à medida que atribui. A proposta é
apresentada para revisão — nada é gravado até o coordenador confirmar.

**Importação**: escolhe-se a época e as competições; a aplicação lê fases, séries, jornadas e jogos,
e mostra um *diff* antes de aplicar. Jogos com delegado já nomeado que mudaram de data, hora ou
recinto aparecem destacados. O mesmo ecrã permite criar um jogo à mão, para nunca depender do site.

**Dashboard**: km por delegado com desvio à média, jogos por competição × delegado, clubes já feitos
× delegado, exportação para CSV.

---

## Como a ordenação funciona

A pontuação resulta de critérios independentes, cada um com peso configurável em **Definições**.
Ativos por omissão:

| Critério | Peso | O que faz |
|---|---:|---|
| Equilíbrio de km | 45 | Sobe quem tem menos quilómetros acumulados na época |
| Rotação de clubes | 35 | Dá prioridade a quem ainda não fez aqueles clubes — prioridade, não proibição |
| Proximidade ao recinto | 20 | Favorece quem vive mais perto, sem nunca impedir uma deslocação longa |

Disponíveis mas desligados, para ativar quando fizer sentido: adequação do nível (reservar os
delegados de elite para os jogos que os exigem), equilíbrio por competição e descanso.

É a **proximidade** que produz naturalmente o padrão Norte/Centro/Sul, sem nenhuma regra rígida de
região: um delegado do Sul com poucos km continua a poder subir ao topo para um jogo no Norte, e o
mapa mostra exatamente isso.

**Bloqueios rígidos** (o delegado sai da lista principal, com o motivo à vista): indisponibilidade na
data, veto ao clube, outro jogo em horário próximo, nível abaixo do exigido pela competição,
distância acima do limite configurado, ou já estar nomeado para o mesmo jogo.

Os quilómetros contam **ida e volta por estrada** e são congelados no momento da nomeação, para o
histórico não mudar se o recinto for corrigido mais tarde.

---

## Utilização

### Preparação inicial

1. **Delegados** — criar cada delegado com número, nome, nível (Elite ou Principal) e morada.
   Carregar em *Localizar pela morada*; se a morada não resolver bem (acontece em zonas rurais),
   escrever as coordenadas à mão — ficam marcadas como manuais e não voltam a ser substituídas.
2. **Importação** — escolher a época, a organização *Competições FPF* e as competições a acompanhar.
   Sincronizar e aplicar. Clubes e recintos são criados automaticamente a partir dos dados da FPF.
3. **Clubes e recintos** — confirmar as coordenadas dos recintos (o ecrã assinala os que faltam) e
   ajustar onde um clube joga noutro recinto numa competição específica.
4. **Definições** — indicar que competições exigem delegado de elite e quais levam delegado de campo.

### No dia a dia

Abrir **Nomeações**, navegar para a semana pretendida e nomear jogo a jogo, ou gerar a proposta
automática e rever. Repetir a importação periodicamente para apanhar alterações de calendário.

---

## Origem dos dados

Não existe API pública oficial da FPF. Os jogos são lidos do **Centro de Resultados**
(`resultados.fpf.pt`), que expõe endpoints estáveis e sem autenticação:

| Endpoint | Devolve |
|---|---|
| `/Competition` | Épocas, organizações e associações |
| `/Competition/Details?competitionId=&seasonId=` | Fases, séries e jornadas |
| `/Competition/GetClassificationAndMatchesByFixture?fixtureId=` | Jogos da jornada, com data, hora e recinto |
| `/Match/GetMatchInformation?matchId=` | Detalhe de um jogo já realizado |

O site está atrás de Cloudflare. A leitura direta usa a stack de rede do Chromium com cabeçalhos
completos de browser; quando mesmo assim vem 403, a aplicação recorre a uma navegação real numa
janela oculta, que passa sempre. Os pedidos são feitos um a um, com pausa, para não sobrecarregar um
site público.

Se o HTML do site mudar, o ecrã de importação continua a permitir criar jogos à mão, e os *parsers*
estão isolados e cobertos por testes com HTML real guardado em `test/fixtures/`.

Geocodificação por **Nominatim** e distâncias por estrada por **OSRM**, ambos com cache local
permanente e ambos configuráveis. Sem acesso a estes serviços, a aplicação estima em linha reta e
assinala-o claramente.

---

## Desenvolvimento

```bash
npm install        # instala e compila o SQLite nativo para o Electron
npm run dev        # aplicação em modo de desenvolvimento
npm test           # testes de parsers e do motor (46)
npm run verificar  # smoke test do processo principal, incluindo os endpoints reais da FPF
npm run verificar:ui   # arranca a janela real e percorre todos os ecrãs
npm run typecheck
npm run dist       # gera o executável portátil em release/
```

### Estrutura

```
src/main/     db/      esquema, migrações e repositórios
              fpf/     cliente HTTP, parsers e sincronização
              geo/     geocodificação, distâncias e cache
              engine/  motor de sugestão e modo automático
              ipc/     handlers expostos ao renderer
src/preload/  ponte contextIsolated
src/renderer/ interface React
src/shared/   tipos de domínio e contrato da API
test/         testes e HTML real guardado como fixtures
```

O motor de sugestão não depende da base de dados: recebe o estado já agregado e devolve os candidatos
pontuados, o que o torna testável em isolamento. Acrescentar um critério novo é criar um ficheiro em
`src/main/engine/componentes/` e registá-lo em `pesos.ts` — nada mais muda.

### Onde ficam os dados

Em `data/delegados.db`, ao lado do executável. É gravada uma cópia (`.bak`) a cada arranque. Para
levar tudo para outro computador, copiar a pasta inteira.
