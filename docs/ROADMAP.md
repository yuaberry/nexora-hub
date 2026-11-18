# NEXORA HUB — Roadmap

> **Estado:** Fase 1 **concluída e verificada** (2026-11-17). Cada fase só
> avança quando a anterior tem `pnpm typecheck` e `pnpm test` verdes **e**
> prova de execução real registada neste ficheiro.

## Visão geral das fases

| Fase | Entrega | Estado | Critério de conclusão |
| --- | --- | --- | --- |
| 1 | Fundação, domínio (busca/planos/armazenamento), API (auth/biblioteca/sessões), web e **desktop jogável** (biblioteca local, pesquisa dinâmica, início com medição, configurações) | ✅ Concluída | 215 testes verdes + AppImage/deb construídos + app real provada (pesquisa "l"→League, jogo lançado e tempo gravado) |
| 2 | **Downloads**: motor HTTP multi-conexão + torrent, manifestos de fonte, verificação por checksum, fila; runner com Wine/Proton e handoff para launcher oficial | ⏳ Planejada | downloads reais com verificação, pause/resume; "baixar e jogar" sem passo manual |
| 3 | **Nuvem e perfis**: saves versionados com conflito, backup completo, cross-save, perfis animados, Família (6 membros), coleções, importação oficial (Steam/Epic/GOG) | ⏳ Planejada | save sobe/desce entre dois dispositivos; conflito mostra as duas versões; cota do plano recusa upload além do limite |
| 4 | **Social e loja**: amigos, presença (heartbeat), status, chat; loja (comprar / comprar via), desejos, comentários, reviews | ⏳ Planejada | amigo vê "jogando X" em tempo real; loja filtra adulto; review 1–10 persiste |
| 5 | **Economia e estatísticas**: Pontos, cosméticos, tarefas, timeline, conquistas globais, capturas | ⏳ Planejada | saldo auditado; timeline agrega eventos reais; screenshot sobe na nuvem |
| 6 | **Comunidade pesada**: fóruns, marketplace de mods 1-clique, detector de mods (Minecraft), clãs, eventos, reputação | ⏳ Planejada | mod instalado em 1 clique reflecte no jogo; detector lista "342 mods, Fabric" |
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

Downloads por torrent, saves na nuvem, amigos, chat, loja, overlay, FPS,
otimizador de SO, controles, IA, Remote Play — apenas tipos e selos
"Planeado". Nenhum contorno de proteções (Denuvo) ou anticheat, em nenhuma
fase (`docs/LEGAL.md`).