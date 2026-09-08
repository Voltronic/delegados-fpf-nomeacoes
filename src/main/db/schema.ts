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
  }
]
