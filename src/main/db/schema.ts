/**
 * Migrações versionadas. Cada entrada corre uma única vez, por ordem, dentro de
 * uma transação. Nunca alterar uma migração já publicada — acrescentar outra.
 */
export interface Migracao {
  versao: number
  descricao: string
  sql: string
}

export const MIGRACOES: Migracao[] = [
  {
    versao: 1,
    descricao: 'Esquema inicial',
    sql: `
      CREATE TABLE delegado (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        numero          TEXT NOT NULL UNIQUE,
        nome            TEXT NOT NULL,
        morada          TEXT,
        lat             REAL,
        lng             REAL,
        nivel           TEXT NOT NULL DEFAULT 'PRINCIPAL' CHECK (nivel IN ('ELITE','PRINCIPAL')),
        telefone        TEXT,
        email           TEXT,
        ativo           INTEGER NOT NULL DEFAULT 1,
        notas           TEXT,
        coords_manuais  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE delegado_indisponibilidade (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        delegado_id  INTEGER NOT NULL REFERENCES delegado(id) ON DELETE CASCADE,
        data_inicio  TEXT NOT NULL,
        data_fim     TEXT NOT NULL,
        motivo       TEXT
      );
      CREATE INDEX ix_indisp_delegado ON delegado_indisponibilidade(delegado_id);

      CREATE TABLE clube (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        nome              TEXT NOT NULL,
        nome_normalizado  TEXT NOT NULL UNIQUE,
        notas             TEXT
      );

      CREATE TABLE delegado_veto_clube (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        delegado_id  INTEGER NOT NULL REFERENCES delegado(id) ON DELETE CASCADE,
        clube_id     INTEGER NOT NULL REFERENCES clube(id) ON DELETE CASCADE,
        motivo       TEXT,
        UNIQUE (delegado_id, clube_id)
      );

      CREATE TABLE recinto (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        nome              TEXT NOT NULL,
        nome_normalizado  TEXT NOT NULL UNIQUE,
        morada            TEXT,
        lat               REAL,
        lng               REAL,
        coords_manuais    INTEGER NOT NULL DEFAULT 0,
        geocodificado_em  TEXT
      );

      CREATE TABLE competicao (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        fpf_competition_id  INTEGER,
        season_id           INTEGER NOT NULL,
        nome                TEXT NOT NULL,
        organizacao         TEXT,
        ativa               INTEGER NOT NULL DEFAULT 1,
        nivel_minimo        TEXT CHECK (nivel_minimo IS NULL OR nivel_minimo IN ('ELITE','PRINCIPAL')),
        usa_delegado_campo  INTEGER NOT NULL DEFAULT 1,
        UNIQUE (fpf_competition_id, season_id)
      );

      -- Recinto associado a um clube; competicao_id NULL = recinto por omissão.
      CREATE TABLE clube_recinto (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        clube_id       INTEGER NOT NULL REFERENCES clube(id) ON DELETE CASCADE,
        competicao_id  INTEGER REFERENCES competicao(id) ON DELETE CASCADE,
        recinto_id     INTEGER NOT NULL REFERENCES recinto(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX ux_clube_recinto_default
        ON clube_recinto(clube_id) WHERE competicao_id IS NULL;
      CREATE UNIQUE INDEX ux_clube_recinto_comp
        ON clube_recinto(clube_id, competicao_id) WHERE competicao_id IS NOT NULL;

      CREATE TABLE jogo (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        chave_natural      TEXT NOT NULL UNIQUE,
        competicao_id      INTEGER NOT NULL REFERENCES competicao(id) ON DELETE CASCADE,
        fase               TEXT,
        serie              TEXT,
        jornada            TEXT,
        fpf_fixture_id     INTEGER,
        fpf_match_id       INTEGER,
        data_hora          TEXT,
        clube_casa_id      INTEGER NOT NULL REFERENCES clube(id),
        clube_fora_id      INTEGER NOT NULL REFERENCES clube(id),
        recinto_id         INTEGER REFERENCES recinto(id),
        recinto_texto_fpf  TEXT,
        estado             TEXT NOT NULL DEFAULT 'AGENDADO',
        importado_em       TEXT,
        alterado_em        TEXT
      );
      CREATE INDEX ix_jogo_data ON jogo(data_hora);
      CREATE INDEX ix_jogo_competicao ON jogo(competicao_id);

      CREATE TABLE nomeacao (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        jogo_id          INTEGER NOT NULL REFERENCES jogo(id) ON DELETE CASCADE,
        delegado_id      INTEGER NOT NULL REFERENCES delegado(id) ON DELETE CASCADE,
        papel            TEXT NOT NULL CHECK (papel IN ('PRINCIPAL','CAMPO')),
        km               REAL,
        minutos          REAL,
        fonte_distancia  TEXT,
        estado           TEXT NOT NULL DEFAULT 'CONFIRMADA'
                         CHECK (estado IN ('SUGERIDA','CONFIRMADA','CANCELADA')),
        motivo_override  TEXT,
        criado_em        TEXT NOT NULL
      );
      -- Um papel por jogo, ignorando as canceladas.
      CREATE UNIQUE INDEX ux_nomeacao_papel
        ON nomeacao(jogo_id, papel) WHERE estado <> 'CANCELADA';
      CREATE INDEX ix_nomeacao_delegado ON nomeacao(delegado_id);

      CREATE TABLE distancia_cache (
        delegado_id   INTEGER NOT NULL REFERENCES delegado(id) ON DELETE CASCADE,
        recinto_id    INTEGER NOT NULL REFERENCES recinto(id) ON DELETE CASCADE,
        km            REAL NOT NULL,
        minutos       REAL,
        fonte         TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        PRIMARY KEY (delegado_id, recinto_id)
      );

      CREATE TABLE config (
        chave  TEXT PRIMARY KEY,
        valor  TEXT NOT NULL
      );

      CREATE TABLE audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        entidade   TEXT NOT NULL,
        entidade_id INTEGER,
        accao      TEXT NOT NULL,
        payload    TEXT,
        criado_em  TEXT NOT NULL
      );
    `
  },
  {
    versao: 2,
    descricao: 'Descrição legível da época na competição',
    sql: `
      -- O seasonId da FPF (106) não diz nada a quem usa a aplicação; guarda-se
      -- a descrição tal como o site a apresenta ("2026-2027").
      ALTER TABLE competicao ADD COLUMN season_descricao TEXT;
    `
  },
  {
    versao: 3,
    descricao: 'Alertas de alterações a jogos',
    sql: `
      -- Os alertas ficam em base de dados, não apenas em memória: um adiamento
      -- ou um conflito de agenda não se pode perder por a aplicação ter sido
      -- fechada antes de o coordenador o ver.
      CREATE TABLE alerta (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        chave         TEXT NOT NULL UNIQUE,
        tipo          TEXT NOT NULL CHECK (tipo IN ('ALTERADO','DESAPARECIDO','CONFLITO')),
        jogo_id       INTEGER REFERENCES jogo(id) ON DELETE CASCADE,
        competicao    TEXT,
        descricao     TEXT NOT NULL,
        data_hora     TEXT,
        detalhe       TEXT NOT NULL,
        lido          INTEGER NOT NULL DEFAULT 0,
        criado_em     TEXT NOT NULL
      );
      CREATE INDEX ix_alerta_lido ON alerta(lido, criado_em);
    `
  },
  {
    versao: 4,
    descricao: 'Proveniência e confirmação das coordenadas dos recintos',
    sql: `
      -- Coordenadas obtidas automaticamente podem estar erradas, e um recinto
      -- no sítio errado corrompe em silêncio todos os quilómetros. Guarda-se
      -- como foram obtidas e se já foram confirmadas por olho humano.
      ALTER TABLE recinto ADD COLUMN origem_coords TEXT;
      ALTER TABLE recinto ADD COLUMN morada_resolvida TEXT;
      ALTER TABLE recinto ADD COLUMN confianca TEXT;
      ALTER TABLE recinto ADD COLUMN confirmado INTEGER NOT NULL DEFAULT 0;

      -- O que já foi escrito à mão conta como confirmado.
      UPDATE recinto SET confirmado = 1, origem_coords = 'MANUAL'
      WHERE coords_manuais = 1 AND lat IS NOT NULL;
    `
  },
  {
    versao: 5,
    descricao: 'Descrição da época para as competições já importadas',
    sql: `
      -- As competições importadas antes de existir esta coluna ficaram com a
      -- época a NULL, e a interface mostrava o id interno ("Época 106"). O
      -- seasonId da FPF segue a sequência ano − 1920 (106 = 2026-2027).
      UPDATE competicao
      SET season_descricao = (season_id + 1920) || '-' || (season_id + 1921)
      WHERE season_descricao IS NULL AND season_id BETWEEN 60 AND 200;
    `
  },
  {
    versao: 6,
    descricao: 'Limpar a cache de distâncias depois da regra das ilhas',
    sql: `
      -- As distâncias já calculadas incluíam o "percurso por estrada" até às
      -- ilhas, o que não faz sentido. É só cache: apaga-se e recalcula-se.
      DELETE FROM distancia_cache;
    `
  },
  {
    versao: 7,
    descricao: 'Remover recintos que são apenas o marcador "a indicar"',
    sql: `
      -- "Recinto A Indicar" é a FPF a dizer que o local ainda não está
      -- decidido, não o nome de um campo. Tinha sido criado como recinto real,
      -- partilhado por jogos de pontos diferentes do país, e chegou a receber
      -- coordenadas nos Açores — o que estragava as distâncias desses jogos.
      CREATE TEMP TABLE marcadores AS
        SELECT id FROM recinto
        WHERE nome_normalizado IN (
          'recinto a indicar', 'a indicar', 'por indicar',
          'recinto a designar', 'a designar', 'por designar',
          'recinto a definir', 'a definir', 'por definir',
          'sem recinto', 'nao definido', 'n d'
        );

      UPDATE jogo SET recinto_id = NULL WHERE recinto_id IN (SELECT id FROM marcadores);
      DELETE FROM clube_recinto WHERE recinto_id IN (SELECT id FROM marcadores);
      DELETE FROM distancia_cache WHERE recinto_id IN (SELECT id FROM marcadores);
      DELETE FROM recinto WHERE id IN (SELECT id FROM marcadores);

      DROP TABLE marcadores;
    `
  },
  {
    versao: 8,
    descricao: 'Jogos escondidos e alertas de recintos sem coordenadas',
    sql: `
      -- Esconder um jogo é uma decisão do coordenador (jogo que não lhe compete,
      -- duplicado da FPF, escalão que não acompanha). Não se apaga nada: fica
      -- guardado, recuperável, e desaparece sozinho quando a data passa.
      ALTER TABLE jogo ADD COLUMN escondido INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE jogo ADD COLUMN escondido_em TEXT;
      CREATE INDEX ix_jogo_escondido ON jogo(escondido, data_hora);

      -- Um recinto sem coordenadas não tem distâncias, e sem distâncias o motor
      -- não ordena candidatos. Passa a dar alerta em vez de ficar em silêncio.
      -- O CHECK do tipo não se altera em SQLite; a tabela é recriada.
      CREATE TABLE alerta_novo (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        chave         TEXT NOT NULL UNIQUE,
        tipo          TEXT NOT NULL CHECK (tipo IN ('ALTERADO','DESAPARECIDO','CONFLITO','RECINTO_SEM_COORDENADAS')),
        jogo_id       INTEGER REFERENCES jogo(id) ON DELETE CASCADE,
        recinto_id    INTEGER REFERENCES recinto(id) ON DELETE CASCADE,
        competicao    TEXT,
        descricao     TEXT NOT NULL,
        data_hora     TEXT,
        detalhe       TEXT NOT NULL,
        lido          INTEGER NOT NULL DEFAULT 0,
        criado_em     TEXT NOT NULL
      );

      INSERT INTO alerta_novo (id, chave, tipo, jogo_id, competicao, descricao, data_hora, detalhe, lido, criado_em)
        SELECT id, chave, tipo, jogo_id, competicao, descricao, data_hora, detalhe, lido, criado_em FROM alerta;

      DROP TABLE alerta;
      ALTER TABLE alerta_novo RENAME TO alerta;
      CREATE INDEX ix_alerta_lido ON alerta(lido, criado_em);
    `
  },
  {
    versao: 9,
    descricao: 'Jogos editados à mão e resumo da última alteração',
    sql: `
      -- Um jogo corrigido à mão passa a ser da responsabilidade do
      -- coordenador: a FPF deixa de lhe tocar, senão a correção desaparecia na
      -- atualização seguinte, sem ninguém dar por isso.
      ALTER TABLE jogo ADD COLUMN editado_manualmente INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE jogo ADD COLUMN editado_em TEXT;

      -- O que mudou na última alteração, em texto pronto a mostrar no cartão do
      -- jogo. Sem isto, o cartão só podia dizer *que* mudou, não *o quê*.
      ALTER TABLE jogo ADD COLUMN ultima_alteracao TEXT;
    `
  },
  {
    versao: 10,
    descricao: 'Repor as horas apagadas pelos jogos já realizados',
    sql: `
      -- Quando um jogo era jogado, a página da FPF passava a mostrar o
      -- resultado em vez da hora, a leitura devolvia "T00:00" e a
      -- sincronização gravava isso por cima da hora certa.
      --
      -- A hora perdida está no texto da alteração que ficou registada
      -- ("data 2026-09-09 às 12:00 → 2026-09-09 às 00:00"), e é de lá que se
      -- recupera. Só se mexe nas linhas que têm exatamente esta assinatura: o
      -- mesmo dia dos dois lados, hora válida à esquerda e meia-noite à
      -- direita. Um jogo mesmo adiado para outro dia não entra aqui.
      UPDATE jogo
         SET data_hora = substr(ultima_alteracao, 6, 10) || 'T' || substr(ultima_alteracao, 20, 5),
             ultima_alteracao = NULL
       WHERE data_hora LIKE '%T00:00'
         AND ultima_alteracao LIKE 'data %'
         AND ultima_alteracao LIKE '%00:00'
         AND substr(ultima_alteracao, 6, 10) = substr(data_hora, 1, 10)
         AND substr(ultima_alteracao, 20, 5) GLOB '[0-9][0-9]:[0-9][0-9]'
         AND substr(ultima_alteracao, 20, 5) <> '00:00';
    `
  },
  {
    versao: 11,
    descricao: 'Memória dos alertas já mostrados',
    sql: `
      -- Um alerta apagado é um alerta tratado. Sem memória, a atualização
      -- seguinte via o mesmo facto e criava-o outra vez: o coordenador
      -- limpava a lista e ela voltava sozinha.
      CREATE TABLE alerta_visto (
        chave     TEXT PRIMARY KEY,
        criado_em TEXT NOT NULL
      );

      -- Os alertas que já existem contam como vistos, senão duplicavam-se na
      -- primeira atualização depois desta versão.
      INSERT OR IGNORE INTO alerta_visto (chave, criado_em)
        SELECT chave, criado_em FROM alerta;
    `
  },
  {
    versao: 12,
    descricao: 'Competições com delegado em todos os jogos, e jogos marcados à parte',
    sql: `
      -- Há competições em que todos os jogos levam delegado, e outras — a Taça,
      -- por exemplo — em que só alguns levam, escolhidos pelo coordenador.
      -- Mostrar tudo misturado enchia a lista de jogos que não são para nomear.
      ALTER TABLE competicao ADD COLUMN todos_com_delegado INTEGER NOT NULL DEFAULT 0;

      -- Por jogo: NULL segue a competição, 1 e 0 são decisões do coordenador
      -- para um jogo em concreto.
      ALTER TABLE jogo ADD COLUMN leva_delegado INTEGER;

      UPDATE competicao SET todos_com_delegado = 1
       WHERE nome IN (
         'LIGA 3 PLACARD', 'LIGA NEXT GEN', 'LIGA BPI', 'LIGA PLACARD', 'LIGA FEMININA PLACARD'
       );
    `
  },
  {
    versao: 13,
    descricao: 'Recintos de cada clube por competição, a partir dos jogos',
    sql: `
      -- A partir desta versão, cada jogo gravado regista o seu recinto na lista
      -- do clube da casa, para a competição do jogo, se ainda lá não houver
      -- nenhum. Os jogos que já existem entram aqui: por clube e competição,
      -- o recinto com mais jogos (e, em empate, o do jogo mais recente).
      -- Associações que já existam não são tocadas.
      INSERT OR IGNORE INTO clube_recinto (clube_id, competicao_id, recinto_id)
        SELECT clube_casa_id, competicao_id, recinto_id FROM (
          SELECT clube_casa_id, competicao_id, recinto_id,
                 ROW_NUMBER() OVER (
                   PARTITION BY clube_casa_id, competicao_id
                   ORDER BY COUNT(*) DESC, MAX(data_hora) DESC
                 ) AS ordem
            FROM jogo
           WHERE recinto_id IS NOT NULL
           GROUP BY clube_casa_id, competicao_id, recinto_id
        )
        WHERE ordem = 1;
    `
  },
  {
    versao: 14,
    descricao: 'Delegado assistente em vez de campo, e delegados sombra',
    sql: `
      -- O antigo "delegado de campo" passa a "assistente": é um delegado que
      -- pode ser nomeado como principal ou como assistente, não os dois papéis
      -- ao mesmo tempo.
      ALTER TABLE competicao RENAME COLUMN usa_delegado_campo TO usa_delegado_assistente;

      -- E aparece um terceiro papel: sombra, para quem está a aprender. Um
      -- CHECK não se altera, por isso a tabela é reconstruída. O índice único
      -- deixa de valer para as sombras: um jogo pode ter mais do que uma.
      CREATE TABLE nomeacao_nova (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        jogo_id          INTEGER NOT NULL REFERENCES jogo(id) ON DELETE CASCADE,
        delegado_id      INTEGER NOT NULL REFERENCES delegado(id) ON DELETE CASCADE,
        papel            TEXT NOT NULL CHECK (papel IN ('PRINCIPAL','ASSISTENTE','SOMBRA')),
        km               REAL,
        minutos          REAL,
        fonte_distancia  TEXT,
        estado           TEXT NOT NULL DEFAULT 'CONFIRMADA'
                         CHECK (estado IN ('SUGERIDA','CONFIRMADA','CANCELADA')),
        motivo_override  TEXT,
        criado_em        TEXT NOT NULL
      );

      INSERT INTO nomeacao_nova (id, jogo_id, delegado_id, papel, km, minutos, fonte_distancia,
                                 estado, motivo_override, criado_em)
        SELECT id, jogo_id, delegado_id,
               CASE papel WHEN 'CAMPO' THEN 'ASSISTENTE' ELSE papel END,
               km, minutos, fonte_distancia, estado, motivo_override, criado_em
          FROM nomeacao;

      DROP TABLE nomeacao;
      ALTER TABLE nomeacao_nova RENAME TO nomeacao;

      CREATE UNIQUE INDEX ux_nomeacao_papel
        ON nomeacao(jogo_id, papel) WHERE estado <> 'CANCELADA' AND papel <> 'SOMBRA';
      CREATE INDEX ix_nomeacao_delegado ON nomeacao(delegado_id);
    `
  },
  {
    versao: 15,
    descricao: 'Alerta dos recintos por confirmar',
    sql: `
      -- Um ponto obtido pela pesquisa automática pode cair no sítio errado, e
      -- daí em diante todos os km desse recinto saem errados sem ninguém dar
      -- por isso. O ecrã de recintos já os contava, mas quem não lá vai nunca
      -- sabia: passa a haver alerta. O CHECK do tipo não se altera em SQLite.
      CREATE TABLE alerta_novo (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        chave         TEXT NOT NULL UNIQUE,
        tipo          TEXT NOT NULL CHECK (tipo IN ('ALTERADO','DESAPARECIDO','CONFLITO',
                                                    'RECINTO_SEM_COORDENADAS','RECINTO_POR_CONFIRMAR')),
        jogo_id       INTEGER REFERENCES jogo(id) ON DELETE CASCADE,
        recinto_id    INTEGER REFERENCES recinto(id) ON DELETE CASCADE,
        competicao    TEXT,
        descricao     TEXT NOT NULL,
        data_hora     TEXT,
        detalhe       TEXT NOT NULL,
        lido          INTEGER NOT NULL DEFAULT 0,
        criado_em     TEXT NOT NULL
      );

      INSERT INTO alerta_novo (id, chave, tipo, jogo_id, recinto_id, competicao, descricao,
                               data_hora, detalhe, lido, criado_em)
        SELECT id, chave, tipo, jogo_id, recinto_id, competicao, descricao,
               data_hora, detalhe, lido, criado_em FROM alerta;

      DROP TABLE alerta;
      ALTER TABLE alerta_novo RENAME TO alerta;
      CREATE INDEX ix_alerta_lido ON alerta(lido, criado_em);
    `
  }
]
