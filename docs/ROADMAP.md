# NEXORA HUB — Roadmap

> **Estado:** Fase 1 **concluída e verificada** (2026-11-17). Cada fase só
> avança quando a anterior tem `pnpm typecheck` e `pnpm test` verdes **e**
> prova de execução real registada neste ficheiro.

## Visão geral das fases

| Fase | Entrega | Estado | Critério de conclusão |
| --- | --- | --- | --- |
| 1 | Fundação, domínio (busca/planos/armazenamento), API (auth/biblioteca/sessões), web e **desktop jogável** (biblioteca local, pesquisa dinâmica, início com medição, configurações) | ✅ Concluída | 215 testes verdes + AppImage/deb construídos + app real provada (pesquisa "l"→League, jogo lançado e tempo gravado) |
| 2 | **Downloads**: motor HTTP multi-conexão com verificação, manifestos de fonte, fila com prioridade, instalação na biblioteca; API de fontes unificada | ✅ Concluída (HTTP) | ciclo completo provado (manifesto → pesquisa → download verificado → biblioteca → jogo lançado → tempo gravado); **torrent e Wine/Proton ficam planeados** |
| 2b | **Torrent e Wine/Proton** | ⏳ Planejada | cliente torrent real (decisão de dependência nativa) + handoff para launcher oficial |
| 3 | **Nuvem e perfis**: saves versionados com conflito, backup completo, cross-save, perfis animados, Família (6 membros), coleções, importação oficial (Steam/Epic/GOG) | ⏳ Planejada | save sobe/desce entre dois dispositivos; conflito mostra as duas versões; cota do plano recusa upload além do limite |
| 4 | **Social e loja**: amigos, presença (heartbeat), status, chat; loja (comprar / comprar via), desejos, comentários, reviews | ⏳ Planejada | amigo vê "jogando X" em tempo real; loja filtra adulto; review 1–10 persiste |
| 5 | **Economia e estatísticas**: Pontos, cosméticos, tarefas, timeline, conquistas globais, capturas | ⏳ Planejada | saldo auditado; timeline agrega eventos reais; screenshot sobe na nuvem |
| 5b | **Comunidade pesada**: fóruns, marketplace de mods 1-clique, detector de mods (Minecraft), clãs, eventos, reputação | ⏳ Planejada | mod instalado em 1 clique reflecte no jogo; detector lista "342 mods, Fabric" |
| 6 | **Biblioteca++**: atalhos de desktop, scan de discos, colecções, "reviewar depois de jogar" | ✅ Concluída | atalho .desktop criado; scan sem ferramentas do Steam; review sem 10 min de jogo recusada (403) |
| 7 | **Performance e overlay**: FPS medido, CPU/GPU/RAM/temperatura, otimizador de SO com ponto de restauração, controles (bateria/remap/layouts), overlay Shift+Tab | ⏳ Planejada | FPS medido dentro do jogo (não inventado); otimização reverte sem quebrar o SO |
| 8 | **IA NEXORA + benchmark**: recomendações, diagnóstico, benchmark com estimativa rotulada | ⏳ Planejada | "jogos parecidos com Terraria" devolve catálogo real; benchmark diz "estimado" vs "medido" |
| 9 | **Futuro**: Remote Play (Sunshine/Moonlight + sessões Nexora Cloud), Big Picture, widgets VTuber | ⏳ Planejada | latência medida com percentis; botão de streaming desligado enquanto não houver medição |

## Fase 1 — Detalhamento

### Entregue

- [x] **Fundação** — monorepo pnpm (Node >= 24, pnpm 12), TS estrito sem `any`,
      ESM NodeNext, `docker-compose.yml` v1 (podman), `pnpm-workspace.yaml`
      com a lista explícita de builds permitidos, CI (typecheck + teste +
      SBOM + scan), `.env.example` com placeholders.
- [x] **`packages/core`** — normalização de pesquisa (acentos, sílabas,
      esqueleto de consoantes), `aliasIndex`, `searchGames` com ranking
      declarado, catálogo curado (`CURATED_GAMES`), planos free/premium,
      barra de armazenamento pura.
- [x] **`packages/protocol`, `packages/download`, `packages/runner`,
      `packages/cloud`, `packages/ui`** — contrato HTTP/WS, interface do motor
      de downloads (só tipos), runner local com **spawn e medição reais**,
      cliente cloud (tipos), tokens de tema + i18n PT-BR/EN + componentes.
- [x] **`apps/api`** — auth espelhada do Nexora Cloud (scrypt, lockout
      atómico, JWT 1 h, refresh derivado com rotação e família, MFA/TOTP com
      segredo cifrado), biblioteca, pesquisa, sessões, envelope de erro,
      paginação inválida = 400, modo degradado em memória.
- [x] **`apps/desktop`** — Electron 42: esquema privilegiado `nexora://`,
      proxy da API sem CORS, sandbox + CSP + isolamento, base local
      (`node:sqlite`), importação de pastas com detecção de executável,
      pesquisa dinâmica com sugestões, detalhes do jogo, Jogar com medição,
      Configurações (tema, idioma, escala, acessibilidade, armazenamento com
      barra azul/cinza/amarelo, plano), selos "Planeado".
- [x] **`apps/web`** — login, biblioteca em leitura, admin esqueleto, PT-BR/EN.
- [x] **Documentação** — `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`
      (D0–D15), este roadmap, `docs/LEGAL.md`.

### Prova de execução real (2026-11-17)

- **Typecheck**: limpo nos 10 projetos (`pnpm typecheck`).
- **Testes**: **215 verdes**, 2 ignorados (os que exigem PostgreSQL real),
  incluindo testes que correm processos de verdade (`/bin/sleep`, `/bin/sh`)
  para provar a medição do tempo jogado.
- **Build**: packages, API, web e desktop compilados.
- **Empacotamento**: `nexora-hub-0.1.0-x86_64.AppImage` (≈ 128 MB) e
  `nexora-hub-0.1.0-amd64.deb` (≈ 99 MB), com `--publish never`.
- **App real** (Electron no `DISPLAY=:0`, com base local semeada e dois
  executáveis de prova que dormem 1 s):
  - a janela abre com o título **NEXORA HUB** e a biblioteca mostra
    "League Of Legends" e "Minecraft Java" (capas = placeholder do tema);
  - escrever **"l"** no campo de pesquisa devolve a sugestão
    **"League Of Legends"** (motor `searchGames`, não substring);
  - `window.nexora.runner.launch("1")` devolve `ok: true` e, após o fim
    natural do processo, a biblioteca regista **1 s** de tempo jogado
    (`Minecraft Java` continua a 0);
  - `window.nexora.storage.usage()` devolve medidas reais do volume
    (982 GB total, 563 GB livres).
- **Bugs encontrados e corrigidos nesta prova** (registados em
  `docs/ARCHITECTURE.md` D12–D16): esquema registado com `://` (navegação
  abortada), `loadURL` ausente (janela em branco), caminhos dependentes do
  `cwd` (base de dados não abria), falha de arranque silenciosa e nome de
  aplicação derivado do `package.json` (BD do pacote em `~/.config/@nexora`).
- **Executável empacotado provado** (AppImage): a janela abre com a interface
  completa e a biblioteca semeada aparece ("League Of Legends", "Minecraft
  Java"), lendo a base local de `~/.config/NEXORA HUB`.

### Fora do escopo da Fase 1 (deliberadamente)

Downloads, saves na nuvem, amigos, chat, loja, overlay, FPS, otimizador de
SO, controles, IA, Remote Play — entregues em fases próprias. Nenhum contorno
de protecções (Denuvo) ou anticheat, em nenhuma fase (`docs/LEGAL.md`).

## Fase 2 — Downloads e fontes (concluída em 2026-11-18)

### Entregue

- [x] **`packages/download`** — motor HTTP multi-conexão com retoma por partes
      independentes, concatenação por ordem, verificação por checksum antes do
      rename, fila com prioridade, espaço verificado antes, pausa/retoma.
      **Torrent continua `planned`**: é dependência nativa com decisão própria
      (biblioteca, licença, build) — a interface e a API dizem-no.
- [x] **`packages/sources`** — manifesto declarativo validado em Zod com
      **attestation legal obrigatória** (sem ela, a instalação é recusada),
      registro de fontes e catálogo unificado pesquisável pelo mesmo motor da
      biblioteca (`searchGames`).
- [x] **`apps/api`** — `POST/GET/DELETE /api/v1/sources` (instalar exige papel
      `admin`), `GET /api/v1/sources/search` e `GET /api/v1/sources/:id`.
      A API serve o catálogo; quem transfere é o cliente (os ficheiros aterram
      no disco do utilizador).
- [x] **`apps/desktop`** — aba **Downloads** real: instalar manifesto `.json`
      (diálogo ou caminho), fontes instaladas com a attestation visível,
      pesquisa no catálogo unificado, fila com progresso medido, pausa/retoma/
      cancelar, e **instalação automática na biblioteca** quando as tarefas
      do jogo terminam (executável dos que o manifesto declara, com `chmod`).
- [x] **`docs/LEGAL.md`** — a fronteira: a NEXORA não hospeda nem redistribui;
      cada manifesto declara a sua base legal e quem o instalou responde por
      ela.

### Prova de execução real (2026-11-18)

- `pnpm typecheck` limpo nos 12 projetos; **236 testes verdes** (2 ignorados =
  PostgreSQL), incluindo o motor com servidor HTTP local (multi-conexão,
  checksum, resume) e a fila (prioridade, pausa/retoma, cancelamento).
- **Ciclo completo, ao vivo, dentro da app** (Electron, com servidor HTTP de
  prova e um manifesto próprio):
  1. `sources.installPath` → manifesto instalado;
  2. `sources.search("jogo e2e")` → resultado `title-exact` (motor da
     biblioteca sobre o catálogo unificado);
  3. `downloads.add` → tarefa na fila;
  4. fila final: `completed`, `verified: true` (checksum verificado);
  5. o jogo **entrou na biblioteca local** com o executável detectado
     (ficheiro com permissão de execução);
  6. `runner.launch` → sessão real; **tempo jogado gravado: 1 s**.
- Bugs encontrados e corrigidos na prova: bomba da fila a relançar a mesma
  tarefa infinitamente, evento de estado tipado como `progress`, corrida de
  gerações na pausa/retoma (a execução abortada sobrescrevia o estado),
  id unificado ambíguo (`fonte/jogo` com barra no jogo) e manifesto sem
  attestation a entrar no registro.

### Fora do escopo desta fase (deliberadamente)

Cliente de torrent (dependência nativa por decidir), Wine/Proton (Fase 2b),
scrapers de sites de terceiros e qualquer contorno de protecções — ver
`docs/LEGAL.md`. Os manifestos das fontes que o operador queira usar são
escritos e instalados por ele, com a base legal declarada no próprio
manifesto; a NEXORA não os distribui.

Downloads por torrent, saves na nuvem, amigos, chat, loja, overlay, FPS,
otimizador de SO, controles, IA, Remote Play — apenas tipos e selos
"Planeado". Nenhum contorno de proteções (Denuvo) ou anticheat, em nenhuma
fase (`docs/LEGAL.md`).

### Segurança por verificação (2026-11-18)

- **Verificação de integridade instalada** (`@nexora/download/verify` + aba
  Downloads): recalcula o SHA-256 de cada ficheiro que o manifesto declara e
  compara com o declarado. Provado ao vivo: instalação intacta → `verified`;
  ficheiro alterado → `mismatch` (0 verificados); ficheiro removido →
  `mismatch`. A medida de segurança não depende da fonte — depende do
  ficheiro.
- **Wine/Proton no runner** (`packages/runner/launch-plan`): um `.exe` no
  Linux corre sob Wine com prefixo **por jogo** (detecção no `PATH`, sem
  instalar nada); sem Wine, o arranque é recusado com motivo explícito
  (`no-runner`). Testes cobrem nativo, Wine, recusa e prefixos distintos.



## Fase 4 — Interface Profissional (concluída em 2026-11-18)

### Entregue

- [x] **Barra superior estilo launcher** — marca, navegação (Biblioteca,
      Downloads, Configurações), alternador de tema animado e selo do
      executável; a sidebar deu lugar a uma barra que não rouba altura.
- [x] **Biblioteca em pele de launcher** — herói com a última sessão (jogar +
      detalhes), linha "Continuar a jogar", grelha de cartões com capa,
      overlay de jogar ao pairar **e** ao focar pelo teclado, estrela de
      favorito, pesquisa viva com sugestões, e linha "Em breve" para os
      módulos planeados (honestidade sem ocupar a navegação principal).
- [x] **Downloads com barras de progresso** reais (`role="progressbar"`,
      `aria-valuenow`), estados com cor do papel (concluído/falhou) e selo
      `sha256 ✓`.
- [x] **Configurações em grelha** de cartões (aparência, acessibilidade,
      armazenamento, conta, diagnóstico do executável).
- [x] **CSS de aplicação** (`apps/desktop/src/renderer/index.css`) — tudo em
      tokens de papel, transições em `--paper-motion` (0 ms com "reduzir
      movimento"), foco visível, `overflow-wrap` em toda a parte.

### Prova de execução real (2026-11-18)

- App real: barra superior com os três itens, herói a mostrar o jogo da última
  sessão, "Continuar a jogar" com cartões, Downloads com barras de progresso e
  estados, Configurações em grelha — capturas do renderer em `docs/`.
- **Bug real encontrado na prova**: o renderer consome o `dist` do
  `@nexora/ui`; uma chave nova no `src` sem reconstruir o pacote faz o
  `translate` falhar (`template.replace` de `undefined`) e a árvore React
  inteira desaparece — ecrã branco. Regra nova no AGENTS.md: **mexer num
  package obriga a reconstruí-lo antes de provar o desktop**.
- `pnpm typecheck` limpo nos 12 projectos; **261 testes verdes**.

### Decisão do operador (2026-11-18)

A **integração com o Nexora Cloud foi adiada pelo responsável** — o launcher
segue sozinho, e a costura técnica (cliente de saves, `decideSync`) fica fechada
até haver decisão. Nada na interface a anuncia como existente.

## Fase 3 — Saves (iniciada em 2026-11-18)

### Entregue

- [x] **`packages/cloud`** — motor de snapshots (`SnapshotStore`): cópia
      recursiva, checksum agregado do **conteúdo** (com limite declarado por
      ficheiro), revisão monotónica nunca reutilizada, restaurar que devolve
      o conteúdo exacto, e `decideSync` (in-sync / local-ahead / remote-ahead
      / **diverged**) — a função pura que a nuvem vai usar quando existir.
- [x] **`apps/desktop`** — índice dos snapshots na base local (tabela
      `save_snapshots`), canais IPC `saves:create/list/restore/remove` e
      secção **Saves** nos detalhes do jogo (criar, listar, restaurar — com a
      pasta de saves dita na interface, não escondida).

### Prova de execução real (2026-11-18)

- `pnpm typecheck` limpo nos 12 projectos; **261 testes verdes** (2 ignorados
  = PostgreSQL).
- Ciclo completo dentro da app: snapshot #1 ("Antes do boss") → o jogador
  progride (`save.dat` → `nivel-7-mundo-4`) → snapshot #2 → restaurar #1 →
  **`save.dat` volta a `nivel-5-mundo-3`** (conteúdo exacto).
- Persistência: depois de fechar e reabrir o launcher, os snapshots 1 e 2
  continuam listados e o próximo snapshot é **#3** — a revisão nunca é
  reutilizada.
- A **nuvem continua `planned`**: o stub do Nexora Cloud recusa com motivo, e
  a interface diz "sincronizar com a conta é fase futura".

### Fora do escopo desta fase (deliberadamente)

Upload/download real para o Nexora Cloud (integração é lote próprio, D7),
pastas de saves configuráveis por jogo, perfis animados, Família e importação
oficial de bibliotecas — fases próprias.



## Interface — layout de launcher (2026-11-19)

### Entregue

- [x] **Barra lateral** — marca, navegação (Início, Biblioteca, Downloads,
      Configurações), secção **MINHA BIBLIOTECA** com filtro vivo e lista de
      jogos (miniatura + título), e rodapé com o estado real da fila de
      downloads (contagem de tarefas activas, não um texto fixo).
- [x] **Cabeçalho** — botão de voltar com **histórico real** de navegação,
      título da página, pesquisa partilhada (cabeçalho → Biblioteca) e
      alternador de tema.
- [x] **Início** — herói DESTAQUE com o jogo da última sessão (Jogar +
      Detalhes), separadores com dados reais (**Quentes** = mais jogados,
      **Jogados recentemente**, **Para descobrir** = nunca jogados) e
      **Surpreenda-me** (escolhe um jogo ao calhas entre os existentes).
- [x] Herói e linhas saíram da Biblioteca (que passa a ser a grelha completa).

### Prova de execução real (2026-11-19)

- App real: barra lateral com 4 jogos listados e filtro, cabeçalho com voltar
  e pesquisa, DESTAQUE com o jogo da última sessão, três separadores, e
  rodapé «Sem downloads em curso» — capturas do renderer em docs/.
- **Sem medição semanal, sem separador semanal**: «Top da semana» não existe
  sem dados semanais — o separador honesto é «Quentes» (mais jogados).
- typecheck limpo; **269 testes verdes**.


## Fase 6 — Biblioteca++ (concluída em 2026-11-19)

Inspirada na análise do Hydra Launcher (docs/HYDRA-RESEARCH.md), com
implementação própria.

### Entregue

- [x] **Atalhos de desktop** (`main/shortcuts.ts`) — ficheiro `.desktop` com
      `Exec` a apontar para o executável do utilizador; só Linux, e noutros
      sistemas a criação é recusada com motivo. Provado: o atalho aparece em
      `~/.local/share/applications`.
- [x] **Colecções** (base local) — criar, listar com contagem, adicionar
      (só jogos que existem), remover, apagar e listar os jogos de uma
      colecção; filtro na Biblioteca.
- [x] **Scan de disco** — percorre as pastas comuns e importa os **filhos**
      (cada pasta de jogo), excluindo as ferramentas que o Steam guarda em
      `steamapps/common` (Proton, runtimes, redistributáveis — lista
      declarada em `scan-filter.ts`, com teste que fixa a lista e o teste de
      que um jogo normal nunca é excluído).
- [x] **Regra "reviewar depois de jogar"** (API) — a review exige 10 minutos
      medidos no jogo; a recusa (403) traz o mínimo e o tempo feito. A rota
      de fim de sessão usa o relógio do servidor, e os testes semeiam o
      repositório para controlar as datas.

### Prova de execução real (2026-11-19)

- Atalho: `shortcuts.create` escreveu
  `~/.local/share/applications/nexora-hub-league-of-legends.desktop` com
  `Name=League Of Legends` e `Exec=.../game.sh %F`.
- Colecções: criada "Favoritos do mês", jogo adicionado (contagem 1),
  listada e os jogos devolvidos.
- Scan: 3 pastas verificadas, importados **só jogos** (Epic Games Store, Hollow
  Knight, REPO, League Of Legends) — depois do filtro, sem Proton nem runtimes.
- `pnpm typecheck` limpo; **285 testes verdes** (49 no desktop, 76 na API).

### Fica para o próximo lote (declarado, não fingido)

Rating ProtonDB antes de instalar (dado externo, com data), extracção
automática depois do checksum, cliente de torrent.


## Fase 6b — ProtonDB e extracção automática (concluída em 2026-11-19)

### Entregue

- [x] **Rating ProtonDB** (`apps/desktop/src/main/protondb.ts`) — consulta
      externa com `fetch` injectado (testável sem rede), tempo limite
      declarado (5 s) e recusa honesta quando o jogo não declara app id ou a
      ProtonDB não responde. O manifesto passou a aceitar `steamAppId`
      opcional (`packages/sources`), e o catálogo unificado expõe-no.
- [x] **Extracção automática** (`packages/download/src/extract.ts`) — corre
      **depois** do checksum passar, para a pasta do jogo; o arquivo
      desaparece só quando a extracção tem sucesso e uma ferramenta ausente
      (`unzip`/`tar`) recusa com motivo, com retento pela interface.
- [x] **Fluxo completo no download-state** — tarefa concluída → extracção (se
      declarada) → registo na biblioteca. Falha de extracção impede o registo
      e fica em `extractionErrors`, com botão "Retentar extracção".
- [x] **Interface** — botão "ProtonDB" por resultado da pesquisa (mostra
      nível, nº de relatórios e fonte), erros de extracção com retento, e
      contagem correcta de downloads na barra lateral.

### Prova de execução real (2026-11-19)

- Manifesto de prova com `steamAppId` + `extract` instalado na app;
- ProtonDB consultada ao vivo: recusa honesta para jogo sem relatórios
  (a API real respondeu 404 — correcto, não inventado);
- download `completed` + `verified: true` (checksum) → extracção correu →
  pasta do jogo só com `jogo.sh` executável → jogo entrou na biblioteca;
- `pnpm typecheck` limpo; **302 testes verdes**.


## Fase 7 — Conta no launcher (concluída em 2026-11-20)

### Entregue

- [x] **Cliente HTTP do renderer** (`renderer/lib/api.ts`) — envelope de erro do
      contrato, token no `sessionStorage` (nunca `localStorage`), renovação
      *single-flight* (dois `401` em paralelo dão um pedido — a repetição
      mataria a família do token de renovação).
- [x] **Contexto de auth** (`renderer/state/auth.tsx`) — login, registo, MFA,
      logout e **troca de conta** (limpa a sessão sem fechar o launcher: a
      biblioteca local é do computador, não da conta).
- [x] **Ecrã de entrada** (`renderer/pages/LoginPage.tsx`) — login/registo/MFA,
      com "continuar sem conta" (a conta é opcional para jogar).
- [x] **Comunidade nos detalhes** (`renderer/components/CommunitySection.tsx`) —
      comentários e reviews (PUT uma por utilizador/jogo), agregado honesto
      (`—` para categoria sem votos) e aviso quando não há sessão.
- [x] **Menu de conta na barra lateral** — entrada leva ao login; com sessão,
      mostra quem está e oferece trocar.

### Prova de execução real (2026-11-20)

- App abre com a biblioteca local (9 jogos) e navegação com "Entrar" — a conta
  é opcional para jogar;
- login pela API devolve 200 "Conta Launcher"; a barra lateral passa a mostrar
  "Conta" e "Trocar de conta";
- comunidade abre nos detalhes com formulário de review e comentário;
- **comentário publicado pelo launcher: 201** (o mesmo caminho do browser).
- `pnpm typecheck` limpo; **302 testes verdes**.

## Fase 5 — Comunidade (iniciada em 2026-11-18)

### Entregue

- [x] **API** — comentários e reviews por jogo (`/api/v1/games/:gameId/comments`,
      `/api/v1/games/:gameId/reviews`, `PUT .../reviews/me`): comentar exige
      sessão, apagar filtra pelo dono (404 para o dos outros, nunca 403), a
      review é **uma por utilizador e jogo** (upsert com índice único) e o
      agregado é honesto (média real; `null` quando ninguém votou na
      categoria). Repositórios em memória **e** PostgreSQL.
- [x] **Web** — página `/jogo/:gameId` com comentários (criar/apagar os
      próprios), formulário de review (nota global + categorias opcionais),
      agregado com `—` para categoria sem votos, e remoção da review própria.
- [x] **Desktop** — comunidade nos detalhes do jogo com selo honesto:
      comentar/reviewar exige conta NEXORA no launcher, que é fase futura.

### Prova de execução real (2026-11-18)

- `pnpm typecheck` limpo; **269 testes verdes** (39 ficheiros), incluindo os
  novos de comunidade: Apagar o comentário de outro devolve **404**, review
  substitui (não duplica), nota 11 devolve **400**, `averageSound` é
  `null` quando ninguém votou em som.
- App real: detalhes do jogo com a nova pele (capa, metadados em
  chave/valor, acções, cartão de saves) — capturas do renderer em `docs/`.

### Fora do escopo desta fase (deliberadamente)

Conta NEXORA dentro do launcher (necessária para comentar/reviewar no
desktop), chat, fóruns, clãs — fases próprias.
