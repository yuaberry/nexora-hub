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
| 3 | **Nuvem e perfis**: saves versionados com conflito, backup completo, cross-save, perfis animados, Família (6 membros), coleções, importação oficial (Steam/Epic/GOG) | 🟡 Em curso (Família pronta) | save sobe/desce entre dois dispositivos; conflito mostra as duas versões; cota do plano recusa upload além do limite |
| 4 | **Social e loja**: amigos, presença (heartbeat), status, chat; loja (comprar / comprar via), desejos, comentários, reviews | ✅ Concluída (push em tempo real fica como passo seguinte) | amigo vê "jogando X" em tempo real; loja filtra adulto; review 1–10 persiste |
| 5 | **Economia e estatísticas**: Pontos, cosméticos, tarefas, timeline, conquistas globais, capturas | 🟡 Em curso (pontos e conquistas prontos; cosméticos/tarefas/capturas planeados) | saldo auditado; timeline agrega eventos reais; screenshot sobe na nuvem |
| 5b | **Comunidade pesada**: fóruns, marketplace de mods 1-clique, detector de modos (Minecraft), clãs, eventos, reputação | 🟡 Em curso (detector pronto; o resto planeado) | mod instalado em 1 clique reflecte no jogo; detector lista "342 mods, Fabric" |
| 6 | **Biblioteca++**: atalhos de desktop, scan de discos, colecções, "reviewar depois de jogar" | ✅ Concluída | atalho .desktop criado; scan sem ferramentas do Steam; review sem 10 min de jogo recusada (403) |
| 7 | **Performance e overlay**: FPS medido, CPU/GPU/RAM/temperatura, otimizador de SO com ponto de restauração, controles (bateria/remap/layouts), overlay Shift+Tab | 🟡 Em curso (medidas + otimizador prontos; FPS e overlay planeados) | FPS medido dentro do jogo (não inventado); otimização reverte sem quebrar o SO |
| 8 | **IA NEXORA + benchmark**: recomendações, diagnóstico, benchmark com estimativa rotulada | 🟡 Em curso (benchmark e recomendações prontos; diagnóstico planeado) | "jogos parecidos com Terraria" devolve catálogo real; benchmark diz "estimado" vs "medido" |
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





## Fase 7 — Otimizador (concluída em 2026-11-21)

### Entregue

- [x] **Domínio** (`packages/core/optimizer/`) — catálogo declarativo dos
      alvos de limpeza (com o custo de cada um escrito) e o que a ferramenta
      **recusa**, com o motivo (governor, swappiness, serviços, limpar RAM)
      — 8 testes no core.
- [x] **Launcher** (`main/optimizer.ts`, `main/optimizer-ipc.ts`) — varredura
      real dos alvos, limpeza com o que foi apagado e o que falhou, histórico
      das execuções e **ponto de restauro** (recria a estrutura; os ficheiros
      de cache não voltam, e a interface diz-o) — 10 testes no desktop.
- [x] **GameMode como tweak de arranque** — quando o `gamemoderun` existe, o
      plano de arranque embrulha o jogo com ele (a camada do jogo mantém-se,
      o ambiente do prefixo Wine mantém-se) — 3 testes novos no runner.
- [x] **Página Otimizador** — o que pode limpar (com MB reais e o custo), os
      ajustes de arranque, **o que a ferramenta não faz** com os motivos, e o
      histórico com o ponto de restauro por execução.

### Prova de execução real (2026-11-21)

- Ao vivo, nesta máquina: a varredura encontrou **29,56 MB em 8014
  ficheiros** (miniaturas 1,70 MB, fontconfig 6,89 MB, shaders Mesa 13,47 MB,
  shaders da Steam 7,50 MB); a limpeza das miniaturas libertou 1,70 MB em 77
  ficheiros sem falhas e a segunda varredura do mesmo alvo deu zero;
- o ponto de restauro foi aplicado a uma execução do histórico;
- **GameMode**: detectado (`/usr/games/gamemoderun`); com o Hollow Knight
  lançado pelo launcher, o daemon **`/usr/bin/gamemoded`** ficou activo com os
  processos do jogo — o tweak é real, não um selo;
- `pnpm typecheck` limpo; **508 testes verdes** no total.


## Interface — temas OLED e preto e branco (2026-11-21)

### Entregue

- [x] **Tema OLED** — fundo `#000000` verdadeiro (pixel desligado = energia
      poupada e contraste infinito), separação por tinta e linha em vez de
      cinzentos;
- [x] **Tema preto e branco** — nenhum token tem matiz: superfícies, tinta e
      acentos são cinzentos, e o acento é branco com tinta escura para o foco
      continuar visível;
- [x] **Alto contraste** cobre os dois temas novos; o alternador rápido do
      cabeçalho continua a ciclar só entre claro e escuro (os temas especiais
      são escolha nas Configurações).

### Prova de execução real (2026-11-21)

- Tema OLED aplicado ao vivo: `data-theme=oled`, fundo **#000000**, cartão
  `#040407`, tinta `#ffffff` — captura das Configurações e do Início;
- Tema preto e branco aplicado ao vivo: `data-theme=noir`, fundo `#000000`,
  acento `#ededed` com tinta `#0a0a0a` — captura do Início sem uma única cor;
- nenhum componente foi alterado: a prova de que a arquitectura de tokens
  aguenta temas novos sem divergência.

## Fase 7 — Desempenho (primeira parte, concluída em 2026-11-21)

Medir o que o sistema realmente tem. O FPS continua planeado — a razão está
escrita na interface.

### Entregue

- [x] **Domínio** (`packages/core/telemetry/`) — leitura da linha `cpu` do
      `/proc/stat` com o uso por **diferença**, `/proc/meminfo` pelo
      disponível, `/proc/loadavg` e sensores de `/sys/class/hwmon`
      (miligraus → graus) — 13 testes no core, com fixtures das leituras
      reais desta máquina.
- [x] **Launcher** (`main/telemetry.ts`, `main/telemetry-ipc.ts`) —
      amostras reais a cada 2 s com um observador que guarda a leitura
      anterior da CPU; cartão **Desempenho** nos detalhes do jogo e nas
      Configurações, com CPU, memória, temperatura mais quente (chip e
      rótulo), carga média e o **FPS marcado como planeado** com o motivo.
- [x] **Bug real corrigido pelo teste contra o sistema** — as entradas de
      `/sys/class/hwmon` são *symlinks*: `Dirent.isDirectory()` devolve
      `false` para elas, e nenhum sensor era encontrado. O leitor passou a
      usar `stat` para resolver o symlink.

### Prova de execução real (2026-11-21)

- Ao vivo, nos detalhes do Hollow Knight e nas Configurações: **CPU 50,3 %,
  memória 44,5 %, temperatura 64 °C (dell_smm · GPU), carga média 4,2** —
  oito sensores reais lidos do sistema (GPU, CPU, coretemp em 2 núcleos,
  ambiente e duas zonas `acpitz`);
- a primeira amostra mostrou **"—"** para a CPU (honesto: sem duas leituras
  não há uso) e passados 2 s mostrou o valor real;
- com o jogo lançado, as leituras continuaram reais (CPU 43,7 %, memória
  37,4 %);
- `pnpm typecheck` limpo; **487 testes verdes** no total.

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










## Fase 7 — Otimizador (concluída em 2026-11-21)

### Entregue

- [x] **Domínio** (`packages/core/optimizer/`) — catálogo declarativo dos
      alvos de limpeza (com o custo de cada um escrito) e o que a ferramenta
      **recusa**, com o motivo (governor, swappiness, serviços, limpar RAM)
      — 8 testes no core.
- [x] **Launcher** (`main/optimizer.ts`, `main/optimizer-ipc.ts`) — varredura
      real dos alvos, limpeza com o que foi apagado e o que falhou, histórico
      das execuções e **ponto de restauro** (recria a estrutura; os ficheiros
      de cache não voltam, e a interface diz-o) — 10 testes no desktop.
- [x] **GameMode como tweak de arranque** — quando o `gamemoderun` existe, o
      plano de arranque embrulha o jogo com ele (a camada do jogo mantém-se,
      o ambiente do prefixo Wine mantém-se) — 3 testes novos no runner.
- [x] **Página Otimizador** — o que pode limpar (com MB reais e o custo), os
      ajustes de arranque, **o que a ferramenta não faz** com os motivos, e o
      histórico com o ponto de restauro por execução.

### Prova de execução real (2026-11-21)

- Ao vivo, nesta máquina: a varredura encontrou **29,56 MB em 8014
  ficheiros** (miniaturas 1,70 MB, fontconfig 6,89 MB, shaders Mesa 13,47 MB,
  shaders da Steam 7,50 MB); a limpeza das miniaturas libertou 1,70 MB em 77
  ficheiros sem falhas e a segunda varredura do mesmo alvo deu zero;
- o ponto de restauro foi aplicado a uma execução do histórico;
- **GameMode**: detectado (`/usr/games/gamemoderun`); com o Hollow Knight
  lançado pelo launcher, o daemon **`/usr/bin/gamemoded`** ficou activo com os
  processos do jogo — o tweak é real, não um selo;
- `pnpm typecheck` limpo; **508 testes verdes** no total.


## Interface — temas OLED e preto e branco (2026-11-21)

### Entregue

- [x] **Tema OLED** — fundo `#000000` verdadeiro (pixel desligado = energia
      poupada e contraste infinito), separação por tinta e linha em vez de
      cinzentos;
- [x] **Tema preto e branco** — nenhum token tem matiz: superfícies, tinta e
      acentos são cinzentos, e o acento é branco com tinta escura para o foco
      continuar visível;
- [x] **Alto contraste** cobre os dois temas novos; o alternador rápido do
      cabeçalho continua a ciclar só entre claro e escuro (os temas especiais
      são escolha nas Configurações).

### Prova de execução real (2026-11-21)

- Tema OLED aplicado ao vivo: `data-theme=oled`, fundo **#000000**, cartão
  `#040407`, tinta `#ffffff` — captura das Configurações e do Início;
- Tema preto e branco aplicado ao vivo: `data-theme=noir`, fundo `#000000`,
  acento `#ededed` com tinta `#0a0a0a` — captura do Início sem uma única cor;
- nenhum componente foi alterado: a prova de que a arquitectura de tokens
  aguenta temas novos sem divergência.

## Fase 7 — Desempenho (primeira parte, concluída em 2026-11-21)

Medir o que o sistema realmente tem. O FPS continua planeado — a razão está
escrita na interface.

### Entregue

- [x] **Domínio** (`packages/core/telemetry/`) — leitura da linha `cpu` do
      `/proc/stat` com o uso por **diferença**, `/proc/meminfo` pelo
      disponível, `/proc/loadavg` e sensores de `/sys/class/hwmon`
      (miligraus → graus) — 13 testes no core, com fixtures das leituras
      reais desta máquina.
- [x] **Launcher** (`main/telemetry.ts`, `main/telemetry-ipc.ts`) —
      amostras reais a cada 2 s com um observador que guarda a leitura
      anterior da CPU; cartão **Desempenho** nos detalhes do jogo e nas
      Configurações, com CPU, memória, temperatura mais quente (chip e
      rótulo), carga média e o **FPS marcado como planeado** com o motivo.
- [x] **Bug real corrigido pelo teste contra o sistema** — as entradas de
      `/sys/class/hwmon` são *symlinks*: `Dirent.isDirectory()` devolve
      `false` para elas, e nenhum sensor era encontrado. O leitor passou a
      usar `stat` para resolver o symlink.

### Prova de execução real (2026-11-21)

- Ao vivo, nos detalhes do Hollow Knight e nas Configurações: **CPU 50,3 %,
  memória 44,5 %, temperatura 64 °C (dell_smm · GPU), carga média 4,2** —
  oito sensores reais lidos do sistema (GPU, CPU, coretemp em 2 núcleos,
  ambiente e duas zonas `acpitz`);
- a primeira amostra mostrou **"—"** para a CPU (honesto: sem duas leituras
  não há uso) e passados 2 s mostrou o valor real;
- com o jogo lançado, as leituras continuaram reais (CPU 43,7 %, memória
  37,4 %);
- `pnpm typecheck` limpo; **487 testes verdes** no total.







## Fase 7 — Overlay e correcção da medida da sessão (concluída em 2026-11-22)

### Entregue

- [x] **Bug real corrigido na medida do tempo jogado** — o `wine` arranca o
      jogo por um `wineserver` persistente noutro grupo de processos e o
      processo arrancado **sai**: a sessão (e o tempo jogado) acabava a meio.
      O runner passou a aceitar uma marca de processo e a sessão dura enquanto
      o jogo corre; parar mata o grupo inteiro — 1 teste novo no runner.
- [x] **Overlay** (`main/overlay.ts`, `renderer/overlay.html` +
      `OverlayApp.tsx`) — janela transparente, sem moldura e sempre ao topo,
      servida pelo mesmo esquema interno, com **CPU, memória, temperatura e
      sessão** medidos a cada 2 s pelo mesmo observador do cartão de
      desempenho; atalho **Shift+Tab** registado só enquanto há jogo a correr.
- [x] **Honestidade no overlay** — o FPS aparece como **Planejado** (medir FPS
      exige injecção no processo do jogo) e amigos/chat ficam na janela do
      launcher, com a razão escrita.

### Prova de execução real (2026-11-22)

- A prova ao vivo apanhou **três** bugs: a sessão que morria aos 6 s com o
      jogo a correr (corrigido pela marca de processo — a sessão manteve-se
      viva aos 3 s, 6 s e 10 s), o `preload` do overlay que apontava para o
      cwd (`/tmp/elec-test/dist/...`) em vez da pasta da app, e o `stop()`
      que matava só o filho directo;
- o overlay abriu (620 × 360, sempre ao topo) e mostrou **CPU 94 %, memória
      65 %, 70 °C (dell_smm · GPU)** — medidas reais do sistema;
- `pnpm typecheck` limpo; testes verdes no total.

## Fase 8 — Recomendações (concluída em 2026-11-22)

Segunda peça da fase da IA e do benchmark: as recomendações existem e são
honestas sobre o que são. O diagnóstico por IA fica planeado.

### Entregue

- [x] **Domínio** (`packages/core/recommend/`) — semelhança por etiquetas
      partilhadas (Jaccard), parecidos com um jogo e recomendação pessoal
      ponderada pelo tempo jogado — 12 testes no core.
- [x] **API** — `GET /api/v1/recommendations/similar/:gameId` (público) e
      `GET /api/v1/recommendations/for-you` (exige sessão; as preferências
      saem da biblioteca ponderada pelo tempo jogado, e o que já se tem é
      excluído) — 7 testes na API.
- [x] **Launcher** — secção **"Recomendado para si"** na Loja, com a razão
      de cada recomendação (as etiquetas partilhadas) e o aviso do algoritmo
      declarado; estados honestos para sem conta e sem biblioteca.

### Prova de execução real (2026-11-22)

- Ao vivo, pela API: uma conta com Hollow Knight (metroidvania/plataforma/
  indie) e Terraria (sandbox/plataforma/coop) na biblioteca recebeu
  preferências `plataforma=2, metroidvania=1, indie=1, sandbox=1, coop=1` e a
  recomendação **Stardew Valley** (partilha `indie`) — **sem os dois jogos
  que já tem**;
- os parecidos com Terraria devolveram **Hollow Knight** (partilha
  `plataforma`, pontuação 0,2) com a razão à vista;
- `pnpm typecheck` limpo; **607 testes verdes** no total.


## Fase 3d — Catálogo público, DLCs e enquadramento das capas (2026-11-22)

### Entregue

- [x] **Catálogo pela loja pública** (`packages/core/steam/catalog.ts`) —
      mapeadores puros de `appdetails` e `storesearch` (o appid da loja é um
      **número**, não texto — a fixture real apanhou o engano) — 8 testes no
      core.
- [x] **Adicionar pelo AppID ou pelo nome** (`main/steam-catalog.ts` +
      `catalog-ipc.ts`) — a entrada nasce com metadado e **sem caminho de
      instalação** (a base local ganhou colunas opcionais, com migração que
      recria a tabela sem perder favoritos nem tempo jogado); o mesmo jogo
      encontrado duas vezes não duplica (`bySteamAppId`) — 11 testes no
      desktop, com rede falsa.
- [x] **DLCs** — secção "Conteúdo adicional" nos detalhes: nomes da loja
      (um pedido por DLC, com limite honesto de 25) e a marca de instalada
      dos manifestos no disco; o resultado fica guardado em `game_dlcs`.
- [x] **Enquadramento** (`renderer/lib/media.ts`) — logo e cabeçalho assentam
      contidos (`contain`), herói e cápsula enchem (`cover`); `GameImage`
      trata da falha: placeholder do tema, nunca moldura vazia.
- [x] **Cache das cápsulas** (`main/cover-cache.ts`) — o renderer não carrega
      a imagem da loja (CSP + user-agent do Electron recusado pela Akamai); o
      processo principal busca-a e guarda-a no disco, servida depois pelo
      `nexora://cover/` — 6 testes.
- [x] **Recusa honesta no arranque** — um jogo sem executável não arranca
      (`not-installed`), e a página mostra o link da loja.

### Prova de execução real (2026-11-22)

- busca real: "hollow knight" → 5 resultados, o primeiro `Hollow Knight`
      (367520);
- adicionar o AppID **440** (Team Fortress 2): entrada nova, e a cápsula
      ficou em cache no disco (`.dev-data/cover-cache/008028b0….jpg`);
- a segunda chamada e o R.E.P.O. (já importado do disco) devolveram
      `duplicate: true` — nenhuma duplicação;
- **R.E.P.O. lançado de verdade**: sessão em curso pelo runner (wine),
      9 segundos medidos, sem crash, e paragem limpa;
- DLCs do Hollow Knight: os dois nomes reais da loja (Official Soundtrack,
      Gods & Nightmares), nenhuma instalada — como é verdade no disco;
- biblioteca: 7 jogos, 3 imagens carregadas com o enquadramento certo
      (herói 1920 `cover`, logo 640 `contain`, cápsula 460 `cover`), e as
      entradas remotas sem imagem mostram o placeholder;
- bug apanhado pelos testes: `writeFile` perdeu o import na refacção —
      a excepção era engolida pelo `catch` e a capa nunca era guardada;
- `pnpm typecheck` limpo; **655 testes verdes** no total.\n\n## Fase 3e — Capas unificadas e parede de jogos (2026-11-22)

### Entregue

- [x] **Cápsula pública para todos** (`steamPortraitUrl` no core + hidratação
      no launcher) — a arte vertical `library_600x900` buscada pelo appid e
      guardada no cache do disco; a biblioteca fica igual em qualquer máquina e
      offline a partir da segunda vez — 6 testes.
- [x] **Marca de capa escolhida** (`cover_chosen`) — uma escolha do utilizador
      nunca é substituída pela hidratação, pelo upsert nem pela sincronização;
      migração de bases antigas sem perder dados (o select da migração tinha
      uma coluna a menos que o insert — apanhado pelo teste).
- [x] **Parede de jogos** (`GameCapsule`) — cápsula 2×3, horas jogadas no
      canto (só a partir de uma hora), botão de jogar desactivado em entradas
      de catálogo; a Biblioteca e o Início passaram a usar a parede.
- [x] **Enquadramento** mantido por tipo de arte (D45).

### Prova de execução real (2026-11-22)

- a hidratação correu sozinha ao abrir a Biblioteca: 4 jogos com appid
      receberam a cápsula em cache (`.dev-data/cover-cache/…`) — Hollow Knight,
      R.E.P.O., Team Fortress 2 e Counter-Strike 2;
- a parede mostrou **7 cápsulas**, 4 com imagem carregada (300×450, 2:3), e as
      entradas sem appid (Epic, LoL, Minecraft) com o placeholder;
- o Início mostrou a mesma parede (7 cápsulas, 4 imagens);
- bug apanhado pelo teste: a migração da base antiga contava 14 valores para
      15 colunas — o select não trazia a coluna nova;
- `pnpm typecheck` limpo; **662 testes verdes** no total.

> Nota de migração: capas escolhidas antes desta versão não tinham marca na
> base. A hidratação substitui-as **uma vez** pela cápsula pública; a partir
> desta versão, uma capa escolhida fica protegida.\n\n## Fase 5f — Reputação (2026-11-24)

### Entregue

- [x] **Domínio** (`packages/core/community/reputation.ts`) — os limiares
      declarados (Bronze → Diamante) e o progresso honesto: a fracção é
      aritmética, e no nível máximo não há objectivo fingido — 5 testes.
- [x] **API** — `GET /api/v1/reputation`: lê o **saldo de pontos real** (sem
      tabela nova, sem número próprio) e devolve nível, nível seguinte,
      fracção e o que falta — 2 testes.
- [x] **Interface** — cartão "Reputação" no topo das Conquistas: nível,
      pontos, barra de progresso e o que falta para o próximo.

### Prova de execução real (2026-11-24)

- conta nova: `{"points":0,"level":"bronze","next":"silver","remaining":100}`;
- o cartão na página de Conquistas mostrou **Bronze · 0 · "Faltam 100 pontos
  para Prata"**;
- `pnpm typecheck` limpo; **728 testes verdes** no total.\n\n## Fase 5e — Eventos da comunidade (2026-11-24)

### Entregue

- [x] **Domínio** (`packages/core/community/events.ts`) — a lotação é
      **aplicada** (1–100, só confirmados ocupam lugar), um evento que já
      começou não aceita entradas, cancelar é só do anfitrião (e cancelar
      fecha as portas) — 7 testes.
- [x] **API** (`modules/events`) — criar (com início no futuro; evento de
      clã exige dono ou oficial), listar a vir, entrar/sair (`going`,
      `interested`, `maybe`), cancelar; migração `0007` — 4 testes de
      integração.
- [x] **Interface** — página "Eventos" (barra lateral): criar com título,
      descrição, lotação e data; a lista com confirmados/lotação, o meu
      estado, entrar/sair e cancelar (só o anfitrião).

### Prova de execução real (2026-11-24)

- evento "Noite de R.E.P.O." criado pelo formulário e **apareceu na lista**
      (0/6);
- "Vou estar lá" clicado → contagem **1/6** e o selo do meu estado;
- `pnpm typecheck` limpo; **721 testes verdes** no total.\n\n## Fase 5d — Clãs (2026-11-24)

### Entregue

- [x] **Domínio** (`packages/core/community/clans.ts`) — quem gere (dono e
      oficiais), quem muda papéis (**só o dono**, e nunca a si próprio), quem
      sai (todos menos o dono), quem expulsa quem (oficial não expulsa
      oficial, o dono nunca é expulso) e o limite de 50 membros — 6 testes.
- [x] **API** (`modules/clans`) — criar (o criador é dono), convidar por
      email, aceitar/recusar (**o email da sessão tem de ser o do convite**),
      promover/despromover, expulsar, sair e dissolver; migração `0006` — 6
      testes de integração.
- [x] **Interface** — página "Clãs" (barra lateral): criar, ver os meus com
      papel e contagem, convites recebidos, membros com promoção/expulsão
      conforme as regras, sair/dissolver; sem sessão, explica o que falta.

### Prova de execução real (2026-11-24)

- clã "[NX] NEXORA" criado pelo formulário e **apareceu na lista**;
- convite por email (201), aceitação pela segunda conta (200) e a API
      confirma **2 membros** (`owner`, `member`);
- a vista da segunda conta mostra o clã com o papel "Membro";
- bug real corrigido: a aceitação do convite não verificava o email da
  sessão — qualquer utilizador aceitaria qualquer convite;
- `pnpm typecheck` limpo; **710 testes verdes** no total.\n\n## Fase 5c — Fóruns de jogo (2026-11-24)

### Entregue

- [x] **Domínio** (`packages/core/community/forums.ts`) — ordem pela última
      actividade (respondido sobe), tópico **fechado** só aceita resposta do
      autor, e os limites declarados — 6 testes.
- [x] **API** (`modules/forums`) — tópicos e respostas atrás de sessão; fechar
      e apagar filtram pelo dono (**404**, nunca 403); migração `0005` com
      índices por jogo/actividade e tópico/criação — 5 testes de integração.
- [x] **Interface** — cartão "Fórum" nos detalhes: criar tópico, abrir,
      responder, fechar/reabrir e apagar (só o que é do utilizador); sem
      sessão, explica o que falta.
- [x] **Bugs reais corrigidos** (apanhados pela prova ao vivo):
      - o **proxy** reencaminhava o corpo sem `content-length` — o servidor
        não sabe onde o corpo acaba;
      - o jogo é identificado por um **caminho** (`/home/…/common/…`): barras
        codificadas não sobrevivem ao roteador de caminhos — comentários,
        reviews e fóruns passaram a levar o jogo na *query* (web e desktop);
      - a secção passava o corpo **já convertido** a um cliente que converte
        sozinho (dupla codificação) — a API recebia texto, não objecto.

### Prova de execução real (2026-11-24)

- conta nova criada pela interface; tópico "Onde ficam os amuletos?" criado
      pelo formulário e **apareceu na lista**;
- tópico aberto, resposta "Fica na Cidade das Lágrimas." enviada e **visível
      no tópico**;
- o POST directo pelo proxy da app devolveu 201 (caminho com barras incluído);
- `pnpm typecheck` limpo; **698 testes verdes** no total.\n\n## Fase 5c — Descrição real da loja na página do jogo (2026-11-23)

### Entregue

- [x] **Domínio** — `steamShortDescription` traduz a descrição curta da loja
      para **texto simples** (etiquetas fora, entidades desfeitas, sem
      interpretar marcado vindo da rede), com limite declarado — 3 testes.
- [x] **Cache local** — a descrição fica guardada na base local (coluna nova
      com migração alinhada); a loja é perguntada **uma vez** e a página
      passa a lê-la de lá — 3 testes.
- [x] **Cartão "Sobre"** nos detalhes: a descrição em texto corrido legível;
      sem AppID, o cartão não existe em vez de fingir.

### Prova de execução real (2026-11-23)

- o Hollow Knight mostrou a descrição real da loja ("Forge your own path in
      Hollow Knight!…"), e a segunda visita leu-a do cache (sem rede);
- bug apanhado pelo teste: a migração tinha o `select` desalinhado com o
      `insert` (a coluna nova entrava na posição errada) — corrigido;
- `pnpm typecheck` limpo; **687 testes verdes** no total.\n\n## Fase 5b — Profundidade: herói de página de jogo, galeria e setas (2026-11-23)

### Entregue

- [x] **Tokens de elevação** (`--paper-shadow-1/2/3`, `--paper-glow`) — a
      camada que dá profundidade: cartão pairado levanta, foco acende.
- [x] **Herói de página de jogo** — a cápsula flutua sobre a arte
      desfocada (camada `blur(28px)`), o título e as acções à direita; a
      coluna de informação perdeu a cápsula duplicada.
- [x] **Galeria de imagens** — as imagens que a Steam guardou passaram a
      faixa horizontal com elevação ao pairar; tocar numa imagem fá-la
      tornar-se a capa (o mesmo `library:setCover`, com a marca de escolha).
- [x] **Setas nas prateleiras** — a fila anda quase uma página; as setas
      nascem desactivadas nas pontas (e numa fila que caiba inteira).
- [x] **Correcção apanhada pela prova**: a fila crescia em vez de scrollar
      (faltava `max-width: 100%` na cadeia do flex).

### Prova de execução real (2026-11-23)

- o herói do Hollow Knight mostra a cápsula (300 px) dentro da arte
      desfocada;
- a galeria tem 6 imagens, **as 6 carregadas**, e o clique nelas passa pelo
      `setCover`;
- a seta "next" da prateleira andou a fila (319 px — o excedente total da
      fila de 7 cápsulas) e as filas curtas ficam com as setas desactivadas;
- `pnpm typecheck` limpo; **681 testes verdes** no total.\n\n## Fase 6a — Modo grande ecrã (2026-11-23)

### Entregue

- [x] **Rota de ecrã inteiro** (`bigpicture`) — a estrutura do launcher
      (barra lateral, pesquisa, cabeçalho) sai de cena; o relógio e o botão
      de sair ficam no topo; o botão "Modo grande ecrã" vive no cabeçalho.
- [x] **Navegação por teclado** — setas movem a selecção entre as cápsulas, o
      Enter abre, o Escape volta ao launcher. (O comando de um jogo não é
      emulado nem anunciado.)
- [x] **Cápsulas grandes** (`size=lg`) e herói com a arte do jogo — a mesma
      montra do Início, desenhada para ver do sofá.

### Prova de execução real (2026-11-23)

- o botão do cabeçalho entrou no modo: `.hub-big` presente, `.hub-shell`
  ausente (ecrã inteiro), três prateleiras (7, 2 e 5 jogos) e 14 cápsulas
  grandes;
- `ArrowRight` moveu o foco de "Hollow Knight" para "R.E.P.O."; `Escape`
  voltou ao launcher (`.hub-big` ausente, `.hub-shell` presente);
- `pnpm typecheck` limpo; **681 testes verdes** no total.\n\n## Fase 5a — Montra visual: prateleiras, destaque com arte e herói dos detalhes (2026-11-23)

### Entregue

- [x] **Prateleiras** (`GameShelf`) — o Início passou de separadores + grelha
      para filas horizontais com dados reais: "Quentes" (mais jogados),
      "Jogados recentemente" (última sessão) e "Para descobrir" (nunca
      jogados); uma prateleira sem jogos **não existe** — nada de filas vazias.
- [x] **Destaque com arte** — o banner do Início mostrou a capa do jogo como
      fundo (com véu para a leitura), em vez do gradiente vazio.
- [x] **Herói dos detalhes** (`hub-hero`) — a arte do jogo como fundo do
      cabeçalho, título e acções principais por cima (jogar, Steam, loja,
      favoritos); um logo — arte com margens — assenta contido no centro em
      vez de servir de fundo; o botão "Voltar" duplicado (o shell já tem um)
      foi removido.
- [x] **Selos honestos** — o "Planejado" que restava no destaque saiu: o que
      ele anunciava já existe.

### Prova de execução real (2026-11-23)

- Início: destaque "R.E.P.O." com a arte no fundo; três prateleiras com 7, 2
      e 5 jogos; "Surpreenda-me" presente;
- Detalhes do Hollow Knight: herói com a arte de fundo (`nexora://cover/…`),
      título e os quatro botões; um único "Voltar" (o do shell);
- `pnpm typecheck` limpo; **681 testes verdes** no total.\n\n## Fase 4a — Saves na nuvem (2026-11-23)

### Entregue

- [x] **API** (`modules/saves`) — enviar, listar, descarregar e apagar versões
      de saves, atrás de sessão; o save de outro utilizador devolve **404**,
      nunca 403; escritas auditadas; limite declarado de 512 MB — 5 testes de
      integração.
- [x] **Arquivo** — o conteúdo é um `tar.gz` (ferramenta do sistema, sem
      dependência nova); a **revisão e o checksum da cópia local viajam com o
      envio**, para a decisão de conflito comparar os dois lados.
- [x] **Cliente** (`packages/cloud/cloud-saves.ts`) — as quatro operações,
      puras e testadas com rede falsa — 8 testes.
- [x] **Launcher** (`save-cloud.ts` + `save-archive.ts`) — enviar empacota a
      pasta real; **restaurar cria um snapshot local de segurança antes** de
      extrair; o estado compara as versões dos dois lados pelo motor
      (`decideSync`) — 3 testes de orquestração + 3 do arquivo.
- [x] **Interface** — cartão "Saves na nuvem" nos detalhes: as versões dos
      dois lados, a decisão (em sincronia / local à frente / remoto à frente /
      **divergente**), enviar, restaurar e apagar; sem sessão, diz o que falta
      em vez de fingir.
- [x] **Decisão revista** — D7: os saves passaram a viver na própria API (a
      conta já existe aqui); o *stub* do Nexora Cloud externo fica para o
      cross-save entre serviços.

### Prova de execução real (2026-11-23)

- API no ar (modo memória, `health: degraded` declarado): conta nova criada
      por HTTP;
- snapshot local #6 criado (pasta real em `/tmp`, 22 bytes);
- envio: `{"ok":true,"revision":6}` — a revisão da cópia local viajou;
- estado depois: local #6 e remoto #6, e o motor disse **em sincronia**;
- a API confirma independentemente (item com o mesmo `gameKey` e checksum);
- o cartão "Saves na nuvem" mostrou os dois lados e o estado;
- bug apanhado pela prova: a cápsula da biblioteca passava o **id da base** à
  navegação (que procura pela chave externa) — os detalhes não abriam;
  corrigido nos dois sítios (Biblioteca e Início);
- `pnpm typecheck` limpo; **681 testes verdes** no total.\n\n## Fase 3c — Imagens da Steam, sincronização e capas personalizáveis (2026-11-22)

### Entregue

- [x] **Domínio** (`packages/core/steam/`) — classificação das imagens pelo
      nome que a Steam lhes dá (logo, herói, cápsula, cabeçalho, desfoque) e a
      ordem declarada de preferência para a capa — 10 testes no core.
- [x] **Launcher** (`main/steam-images.ts`) — lê a pasta de imagens do jogo
      **recursivamente** (a Steam moderna guarda o herói em subpastas com
      nomes de hash) e devolve a capa escolhida e as alternativas — 5 testes
      no desktop.
- [x] **Protocolo** — `nexora://cover/<caminho>` serve as imagens do disco:
      sem ele, a CSP proíbe `file://` e um caminho absoluto não resolve sob o
      esquema interno. O caminho é codificado pelo renderer.
- [x] **Sincronização** (`main/steam-sync.ts`) — relê os manifestos da Steam e
      traz o que mudou: jogos novos entram, títulos diferentes são
      corrigidos, e a capa escolhida pelo utilizador **nunca** é mexida.
- [x] **Personalização** — secção **Capa** nos detalhes: escolher um ficheiro
      (com diálogo do sistema), escolher entre as imagens que a Steam guardou,
      ou restaurar a capa automática. A base local ganhou `setCover`.

### Prova de execução real (2026-11-22)

- A importação passou a trazer as capas: **Hollow Knight** →
      `librarycache/367520/logo.png` e **R.E.P.O.** →
      `librarycache/3241660/<hash>/logo.png` (o logo dentro de uma subpasta
      com nome de hash — a leitura recursiva encontrou-o);
- a biblioteca mostrou os **logos reais** nos cartões (a imagem carrega:
      `naturalWidth` 640 × 360), e a sincronização devolveu
      `updated: 0, added: 0, unchanged: 2` — honesto: nada mudou;
- a secção Capa listou **6 imagens** da Steam (logo, herói, cápsula,
      cabeçalho, a cápsula de nome de hash e o desfoque) com as dimensões
      reais (1920, 300, 460…), e a troca para o `library_hero.jpg` foi
      aplicada;
- bug apanhado pela prova: o caminho absoluto perdia a barra inicial na
      junção com `/cover/` — a codificação do caminho corrigiu-o (404 → 200);
- `pnpm typecheck` limpo; **624 testes verdes** no total.

## Fase 5b — Detector de modos (concluída em 2026-11-21)

Primeira peça da comunidade pesada: o que a instância do jogador tem
instalado. Fóruns, marketplace de mods, clãs, eventos e reputação ficam
planeados.

### Entregue

- [x] **Domínio** (`packages/core/mods/`) — detecção do carregador pelos
      marcadores dentro de cada `.jar` (Fabric, Quilt, Forge, NeoForge — o
      NeoForge antes do Forge, porque o pacote contém os dois), leitura do
      nome e da versão do manifesto (JSON e TOML) e o resumo por carregador —
      12 testes no core.
- [x] **Launcher** (`main/mods.ts`, `main/mods-ipc.ts`) — encontra a pasta
      `mods` nas formas que os jogos usam (ao lado do executável,
      `.minecraft/mods`, um nível abaixo), lê as entradas com o `unzip` do
      sistema e só conta `.jar` (um `.disabled` está desligado) — 9 testes no
      desktop, com jars zip de verdade.
- [x] **Interface** — secção **Mods** nos detalhes do jogo: total, quantidade
      por carregador, a lista com nome e versão, e os estados honestos
      ("nenhuma pasta de modos" / "pasta vazia").

### Prova de execução real (2026-11-21)

- Um modpack de prova com **42 jars** (35 Fabric, 5 Forge, 2 sem marcador):
      o detector deu **42 modos, 35 Fabric, 5 Forge, 2 desconhecidos**, com
      nomes e versões lidos dos manifestos;
- no launcher: os detalhes do "Minecraft Modpack" mostraram a secção Modos
      com **42 modos**, os três carregadores e a lista (Ae2 2.3.0 Forge,
      Animatica 1.0.26 Fabric, …), com `core-shaders.jar` honestamente
      **Desconhecido**;
- `pnpm typecheck` limpo; **588 testes verdes** no total.

## Fase 8 — Benchmark medido (concluída em 2026-11-21)

Primeira metade da fase da IA e do benchmark: as medidas existem e são
honestas. As recomendações e o diagnóstico ficam planeados.

### Entregue

- [x] **Domínio** (`packages/core/benchmark/`) — catálogo de cargas
      deterministas (iterações e semente declaradas) com **referência por
      carga**, pontuação declarada e versão de referência — 12 testes no core.
- [x] **Launcher** (`main/benchmark.ts`, `main/benchmark-ipc.ts`) — corre cada
      carga num processo filho do **Node do sistema**, mede com o relógio
      monótono, guarda o histórico e recusa com motivo quando não há Node —
      6 testes no desktop.
- [x] **Página Benchmark** — pontuação global, pontuação e tempo por carga
      (ou "não medido" honesto), a versão da referência, a variação face à
      corrida anterior e o histórico — feito para comparar **antes e depois**
      de uma optimização.

### Prova de execução real (2026-11-21)

- Ao vivo, no launcher: a primeira corrida correu e **falhou todas as cargas**
      — a prova apanhou o bug (`process.execPath` é o Electron dentro da app,
      que não aceita `-e`). Depois da correcção, a página mostrou
      **pontuação global 997,8** com ordenação a 895,5 (1.675 ms) e soma de
      caracteres a 1.100,1 (81,8 ms), histórico com as duas corridas;
- `pnpm typecheck` limpo; **567 testes verdes** no total.

## Fase 5 — Pontos e conquistas (concluída em 2026-11-21)

Primeira metade da fase da economia. Cosméticos, tarefas e capturas ficam
como o que são — planeados.

### Entregue

- [x] **Domínio** (`packages/core/achievements/`) — catálogo de conquistas
      com regras puras sobre as sessões reais (primeira sessão, dez e cem
      horas, cinco jogos distintos, coruja, maratona) e a pontuação de cada
      uma — 9 testes no core.
- [x] **API** — `GET /api/v1/achievements` (avalia, desbloqueia o que é novo
      **uma vez** e paga os pontos) e `GET /api/v1/points` (saldo + livro),
      com repositórios em memória **e** PostgreSQL (migração 0004: um par
      utilizador/conquista, e o livro só de acréscimos) — 9 testes na API.
- [x] **Launcher** — página **Conquistas** com os pontos, as barras de
      progresso reais, a contagem de jogadores que têm cada conquista e o
      livro de onde os pontos vieram.

### Prova de execução real (2026-11-21)

- Ao vivo, pela API: uma conta sem sessões não tinha nada desbloqueado; depois
  de uma sessão real de 30 min (criada e terminada pela API), a conquista
  **"Primeira sessão"** desbloqueou-se com valor 1, 10 pontos e 1 jogador — e
  o livro registou a entrada com o motivo;
- no launcher: a página mostrou **10 de 440 pontos possíveis**, 1 de 6
  desbloqueadas, a barra dos cinco jogos a **20 %** (1 de 5) e o livro com
  "+10 · 21/11/2026, 19:24";
- `pnpm typecheck` limpo; **549 testes verdes** no total.

## Fase 4 — Chat (concluída em 2026-11-21)

A fase social fica completa: amigos, presença e chat. O *push* em tempo real
pelo gateway fica como o próximo passo honesto.

### Entregue

- [x] **Domínio** (`packages/core/chat/`) — conversas directas entre amigos:
      abrir/reutilizar pelo par, enviar mensagem (corpo aparado, limite de
      2000 caracteres), listar e ordenar pelo mais recente — 11 testes no
      core.
- [x] **API** — `GET/POST /api/v1/chat/conversations`,
      `GET/POST /api/v1/chat/conversations/:id/messages`, com repositórios em
      memória **e** PostgreSQL (migração 0003, par único por índice) e
      escritas auditadas — 11 testes na API + integração sobre a base real.
- [x] **Launcher** — canal IPC do chat, entrada **Chat** na navegação, botão
      **"Mensagem"** em cada amigo (abre a conversa), página com a lista de
      conversas (excerto e data), as mensagens com autor e data, e o campo de
      envio. A página pergunta à API a cada 5 s.

### Prova de execução real (2026-11-21)

- Ao vivo, pela API: Ana e Bruno tornaram-se amigos, a conversa abriu pelo
  par (a segunda abertura reutilizou a mesma), Ana enviou "Bora jogar REPO?"
  e Bruno leu com o autor e a data;
- no launcher: o botão "Mensagem" abriu a conversa, a bolha da Ana apareceu
  com a data, e o Bruno enviou **"Vamos, estou online!"** pelo launcher — a
  bolha nova apareceu imediatamente;
- `pnpm typecheck` limpo; **531 testes verdes** no total (148 verdes contra
  o PostgreSQL real).

## Fase 4 — Amigos e presença (concluída em 2026-11-21)

Primeira metade da Fase 4 (Social): amigos, pedidos e presença. O chat fica
como o que é — planeado.

### Entregue

- [x] **Domínio** (`packages/core/social/`) — máquina de estados da amizade
      (pedir, aceitar, recusar, cancelar, remover) e presença com validade
      (heartbeat, TTL de 45 s, presença visível só para amigos, limpeza dos
      expirados) — 18 testes no core.
- [x] **API** — `GET/POST /api/v1/friends`,
      `POST /api/v1/friends/requests/:id/accept|decline|cancel`,
      `DELETE /api/v1/friends/:userId`, `GET /api/v1/friends/presence` e
      `POST /api/v1/presence/heartbeat`, com repositórios em memória **e**
      PostgreSQL (migração 0002) — 17 testes na API + teste de integração
      sobre a base real.
- [x] **Launcher** — página **Amigos**: adicionar por email, pedidos
      recebidos (aceitar/recusar) e enviados (cancelar), lista com a
      presença de cada amigo ("A jogar X", "Online", "Offline"), remover, e
      actualização automática a cada 15 s.
- [x] **Presença enquanto se joga** — o lançamento do jogo bate o coração
      com o jogo em curso, repete a cada 30 s enquanto a sessão dura, e bate
      com `null` quando ela acaba. O token da conta vive só dentro da sessão.

### Prova de execução real (2026-11-21)

- Ao vivo, pela API: Ana pediu amizade a Bruno, Bruno aceitou (a amizade
  ficou nos dois sentidos), Bruno bateu o coração e **Ana viu Bruno online**;
- no launcher: **Ana lançou o Hollow Knight pelo launcher** (com a conta
  dela) e a presença do Bruno passou a mostrar Ana
  **"A jogar Hollow Knight"** com o jogo real do manifesto
  (`/home/llinux/.local/share/steam/steamapps/common/hollow knight`); ao
  parar a sessão, o jogo saiu da presença (o coração final bate com `null`)
  e a pessoa continua online;
- a página Amigos mostrou a lista com o selo "Online" e o subtítulo "A jogar
  Hollow Knight";
- `pnpm typecheck` limpo; **466 testes verdes** no total (136 verdes contra
  o PostgreSQL real).

## Fase 2b — Wine/Proton na prática e handoff para a loja (2026-11-21)

### Entregue

- [x] **Bug real corrigido no arranque** — um jogo Windows (`.exe`) no Linux
      morria com **código 1** em milissegundos, sem erro visível: o Wine faz
      `chdir` para a pasta do prefixo e o launcher nunca a criava (o `spawn`
      não cria directorias). Agora o prefixo é criado antes do arranque
      (`ensureWinePrefix`, com o caminho construído por `winePrefixPath`,
      exportado do `@nexora/runner`), por jogo.
- [x] **Handoff para o launcher oficial** — jogos vindos dos manifestos da
      Steam guardam o appid na base local; os detalhes do jogo passam a ter
      **"Abrir na Steam"** (`steam://rungameid/<appid>`, o protocolo que o
      cliente da Steam regista no sistema). O URL é construído no processo
      principal — o renderer nunca abre URLs.
- [x] **A fronteira legal fica escrita** (D32): o launcher oferece o caminho
      legítimo — jogar com o que o utilizador tem, ou abrir na loja onde
      comprou. Não há emulação de autenticação nem "online-fix" em nenhuma
      fase (`docs/LEGAL.md`).

### Prova de execução real (2026-11-21)

- **Causa raiz**, reproduzida à mão: `wine: chdir to
  ~/.config/NEXORA HUB/wine-prefixes/… : Arquivo ou diretório inexistente`
  — o prefixo não existia;
- **Hollow Knight**: lançado pela app, sessão viva **24 s** (`crashed:
  false`), parada limpa e **24 s gravados** na biblioteca local;
- **R.E.P.O.**: lançado pela app, sessão viva **14 s** (o diálogo do Wine a
  inicializar o prefixo aparece na captura — o prefixo passa a ser criado
  pelo launcher);
- **Handoff**: após a importação oficial, o botão "Abrir na Steam" aparece
  nos detalhes do Hollow Knight; o clique abriu o **cliente oficial da
  Steam** (processo confirmado) com a mensagem "a abrir na Steam";
- `pnpm typecheck` limpo; **431 testes verdes** no total.

## Fase 3c — Importação oficial (Steam) (concluída em 2026-11-20)

### Entregue

- [x] **Domínio** (`packages/core/importers/`) — parser de VDF (Valve
      KeyValues) e leitura dos manifestos da Steam
      (`parseSteamLibraryFolders`, `parseSteamAppManifest`,
      `steamInstallPath`). O parser é escrito contra o **formato real**,
      verificado numa instalação Steam desta máquina; um manifesto partido
      lança o erro com a posição, e quem importa salta o ficheiro — 18 testes
      no core.
- [x] **Launcher** (`main/disk-scan.ts`, `main/official-import.ts`,
      `main/official-ipc.ts`) — botão "Importar da Steam" na Biblioteca:
      lê as bibliotecas declaradas, dá o **título real** a cada jogo,
      detecta o executável, ignora as ferramentas da própria Steam (Proton,
      runtimes — a mesma lista do scan de disco) e devolve um relatório
      honesto por loja; Epic e GOG dizem que o formato local ainda não foi
      verificado, em vez de fingir.
- [x] **Bug real corrigido** — a identidade da entrada da biblioteca era o
      caminho normalizado, sem resolver simlinks: `~/.steam/steam` e
      `~/.local/share/Steam` são a mesma pasta, e o mesmo jogo entrava duas
      vezes. O identificador passou a ser o caminho **resolvido**
      (`externalKeyFor` com `realpath`), com teste do simlink.
- [x] **Refacção** — a leitura de pastas (`scanForExecutables`,
      `localCoverFile`, `importFolder`) saiu de `import-service.ts` (que
      importa Electron) para `disk-scan.ts`, sem Electron: agora é testável
      fora do runtime e a importação oficial não arrasta o `dialog` para um
      caminho puro.

### Prova de execução real (2026-11-20)

- Ao vivo, contra a **Steam instalada nesta máquina**: importou
  **"Hollow Knight"** e **"R.E.P.O."** (títulos dos manifestos — a pasta é
  `REPO`), ignorou **3** entradas (Proton Experimental, Proton 11.0, Steam
  Linux Runtime 4.0) e detectou os executáveis reais
  (`hollow_knight.exe`, `REPO.exe`);
- no launcher, com a base limpa: o scan de disco importou pelas pastas
  (Hollow Knight, REPO, League Of Legends, Epic Games Store) e a importação
  oficial **actualizou as mesmas entradas** — `REPO` passou a `R.E.P.O.` e
  a biblioteca ficou com **4 jogos, sem duplicados** (a prova do simlink);
- `pnpm typecheck` limpo; **420 testes verdes** no total (118 verdes contra
  o PostgreSQL real).

## Fase 3b — Família (concluída em 2026-11-20)

Grupo familiar com limite de plano e biblioteca partilhada — a primeiro
bloco da Fase 3 (Nuvem e perfis) a ficar pronto: saves na nuvem e perfis
animados continuam planeados.

### Entregue

- [x] **Domínio** (`packages/core/family/`) — tipos, limites por plano
      (`maxFamilyMembers`: livre 2, premium 6), benefícios declarados (a
      partilha de saves na nuvem aparece como **planeada**, não como
      existente) e a máquina de estados pura (`createFamily`,
      `inviteMember`, `acceptInvite`, `declineInvite`, `removeMember`,
      `dissolveFamily`, `expireInvites`) mais a junção da biblioteca
      partilhada (`mergeSharedLibraries`) — 31 testes no core.
- [x] **Planos** (`packages/core/plans/`) — `maxFamilyMembers` por plano; o
      limite é regra de domínio, aplicada pelo servidor.
- [x] **API** — `GET/POST/DELETE /api/v1/family`, `POST /api/v1/family/invites`,
      `POST /api/v1/family/invites/accept|decline`,
      `DELETE /api/v1/family/members/:userId`, `GET /api/v1/family/games`,
      com repositórios em memória **e** PostgreSQL, convites com código único
      e validade de 7 dias, escritas auditadas — 24 testes na API.
- [x] **Launcher** — página **Família**: criar grupo, entrar com código,
      convidos pendentes com o código à vista, membros com papel, remover
      (dono) / sair (na própria linha), dissolver (só o dono), indicadores de
      membros e biblioteca partilhada, e benefícios do plano com o selo
      honesto no que ainda não existe.
- [x] **Migrações** — migração `0001` que criou as tabelas `comments`,
      `reviews` e `wishlists` (que faltavam na 0000 — bug real: os
      repositórios PostgreSQL escreveriam contra tabelas inexistentes) e as
      três tabelas da família, com os índices únicos que as regras exigem.
- [x] **Bug real corrigido** — a lista de desejos nunca funcionou no
      launcher: o preload chamava `wishlist:list` sem o token, e o handler
      exige-o. O token passa a viajar do renderer em cada chamada.

### Prova de execução real (2026-11-20)

- Ao vivo, pela API: grupo criado (dono + plano livre = 2 membros), mãe
  convidada (código `BVATPGAUF4`) e aceite — grupo com dois membros e
  **0 lugares livres**; terceiro convite recusado com **409** (o limite do
  plano é aplicado no servidor, não só mostrado);
- PostgreSQL **real** (cluster local): migrações aplicadas (13 tabelas),
  suite de integração verde — incluindo o fluxo da família e o teste de
  regressão que escreve comunidade, desejos e família sobre a base real;
- Launcher real: página **Família** mostrou "Família Real · Limite do plano:
  2 membros · 0 lugares livres", membros Dono e Mãe, botão "Dissolver grupo"
  e "Nenhum convite pendente";
- `pnpm typecheck` limpo; **389 testes verdes** (4 ignorados sem
  `DATABASE_URL`; com base real, **392 verdes**).

## Fase 9 — Estatísticas e timeline (concluída em 2026-11-20)

### Entregue

- [x] **Domínio** (`packages/core/stats/`) — `summarizeSessions` (horas,
      sessões, jogos distintos, top de jogos, género favorito pela etiqueta,
      histograma por hora e hora de pico) e timeline (`sortTimeline`,
      `limitTimeline` com ordem estável em empates) — 60 testes no core.
- [x] **API** — `GET /api/v1/stats/summary` e `GET /api/v1/timeline`
      (exigem sessão; a agregação é no **servidor**, o cliente não soma
      listas) com `listAllByUser`, `listEndedByUser` e `listByUser` nos
      repositórios em memória **e** PostgreSQL.
- [x] **Launcher** — página "Estatísticas" com quatro indicadores, top de
      jogos, género favorito e timeline (sessões, comentários, reviews,
      desejos), com aviso quando não há sessão.

### Prova de execução real (2026-11-20)

- Duas sessões criadas e terminadas pela **API** (caminho real do
  utilizador); a página mostrou **0,09 h · 2 sessões · 2 jogos distintos ·
  hora de pico 19:00**, top de jogos e "Género favorito: sem dados ainda"
  (a biblioteca da conta está vazia — honesto, não inventado);
- `pnpm typecheck` limpo; **334 testes verdes** no total.

## Fase 8 — Loja (directório de compras) (concluída em 2026-11-20)

### Entregue

- [x] **Domínio** (`packages/core/store/`) — tipos, directório curado com
      ligações para **lojas oficiais** (Steam, GOG, site oficial) e filtros
      puros (pesquisa, plataforma, conteúdo adulto escondido por omissão).
- [x] **API** — `GET /api/v1/store` (público: ver sem conta) e
      `GET/POST/DELETE /api/v1/wishlist` (exige sessão, idempotente pelo par
      utilizador/jogo, com implementação em memória **e** PostgreSQL).
- [x] **Launcher** — página da Loja com grelha, filtros (plataforma, adulto),
      botão "Comprar" que abre a loja oficial no browser do sistema, lista de
      desejos com aviso quando não há sessão, e preços formatados por `Intl`.
- [x] **shell.openExternal** — o renderer nunca abre URLs: o processo
      principal decide, e só `http(s)` passa.

### Prova de execução real (2026-11-20)

- Loja abre pela barra lateral com 5 jogos (League of Legends, Cyberpunk 2077,
  Hollow Knight, Terraria, Stardew Valley), cada um com plataformas, preço e
  botão "Comprar via <loja>" — selo ◇Planejado e o aviso de que a NEXORA não
  vende nem hospedeia;
- API: directório público (200 sem sessão), lista de desejos exige 401,
  adicionar/remover idempotente, jogo inexistente devolve 404, plataforma
  inválida devolve 400 — **83 testes verdes na API**;
- `pnpm typecheck` limpo; **319 testes verdes** no total.

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
