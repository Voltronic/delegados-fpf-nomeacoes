# Regras deste repositório

## Nunca apagar `release/` nem `data/`

**Não apagar, mover, renomear nem esvaziar as pastas `release/` e `data/` — nem nada lá dentro.**
Isto não tem exceções: nem para "limpar antes de compilar", nem porque uma compilação falhou, nem
porque a pasta parece conter só ficheiros gerados.

A razão: a aplicação é portátil e guarda a base de dados **ao lado do executável**, em
`release/data/delegados.db`. `release/` não é só saída de compilação — contém os dados reais do
coordenador (delegados, moradas, confirmações de recintos, nomeações). Já se perdeu uma base de dados
assim, com delegados inseridos à mão e recintos confirmados um a um.

O `electron-builder` escreve por cima do que precisa sem que seja preciso apagar nada. Se alguma vez
uma compilação parecer bloqueada por ficheiros em uso, a causa é quase sempre um processo `electron`
ou a aplicação aberta: fechar o processo resolve, apagar a pasta não.

Se apagar alguma coisa nessas pastas parecer mesmo necessário, **perguntar primeiro** e explicar
porquê.

## Nunca apagar a base de dados sem autorização

Não apagar, substituir, truncar nem recriar `data/delegados.db` (nem os `-wal`/`-shm` ao lado) sem
**pedir autorização explícita** primeiro, mesmo que pareça vazia, de teste ou corrompida. O mesmo
vale para as cópias em `C:\Temp\delegados-fpf-nomeacoes\backups`. Verificações e experiências
usam sempre uma base de dados própria numa pasta temporária.

### O que se pode apagar

`out/`, `node_modules/`, `dist/`, `*.log` — tudo regenerável e sem dados do utilizador.

## Cópias de segurança

Ficam em `C:\Temp\delegados-fpf-nomeacoes\backups`, deliberadamente **fora** da pasta da aplicação
(ver `src/main/db/copias.ts`). Uma cópia por arranque, antes das migrações, as 10 mais recentes.
Não mudar este destino para dentro de `release/`: era exatamente esse o erro que fez perder dados.

## Migrações e versões entregues ao cliente

O executável é entregue ao coordenador por cima da pasta que ele já tem. A base de dados dele **não é
substituída**: no arranque, `abrirBaseDados` aplica as migrações em falta, uma a uma, cada uma na sua
transação (`src/main/db/index.ts`).

Ao mudar o esquema:

1. Acrescentar uma migração nova no fim de `MIGRACOES` (`src/main/db/schema.ts`), com o número
   seguinte. **Nunca** editar nem renumerar uma migração já entregue — a base de dados do cliente já
   a tem registada e ela não voltaria a correr.
2. Escrever a migração de forma a sobreviver a dados reais (`ALTER TABLE ... ADD COLUMN`,
   `CREATE TABLE IF NOT EXISTS`, `UPDATE` de preenchimento). Se falhar, a transação reverte e a
   aplicação mostra o erro e não abre — melhor do que ficar a meio.
3. Não é preciso pedir ao coordenador para fazer nada: basta substituir o `.exe` e manter a pasta
   `data/`.

Antes de qualquer migração é gravada uma cópia de segurança, para haver sempre um estado anterior.
Uma base de dados com um esquema **mais recente** do que o executável é recusada com uma mensagem,
em vez de ser aberta e corrompida.

## Compilar

```
npm run dist      # portátil para release/  (NÃO apagar release/ antes)
npm run verificar # verificações do processo principal, contra o site real da FPF
npm run verificar:ui  # verificações da interface numa janela Electron
npm test          # testes unitários
```

Antes de compilar pode fechar-se a aplicação se estiver aberta. As verificações que arrancam Electron
deixam processos para trás — convém fechá-los no fim
(`Get-Process electron | Where Path -like 'C:\Code\delegados-fpf-nomeacoes*' | Stop-Process`).

## Esperar por comandos longos

Correr o próprio comando em segundo plano e ler o resultado quando terminar. Nunca escrever ciclos
`until <condição>; do sleep N; done` — já custaram mais de uma hora de espera inútil.

## Língua

Código, comentários, interface e mensagens de commit em português de Portugal.
