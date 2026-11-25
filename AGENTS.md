# AGENTS.md — NEXORA HUB

Convenções e regras para qualquer pessoa (humana ou agente) que altere este repositório.

## 1. O que é este repositório

O **NEXORA HUB** é o launcher de jogos da NEXORA: biblioteca local unificada,
pesquisa rápida, medição de tempo jogado e uma interface que cresce por fases
(cloud saves, amigos, loja, overlay — todas planeadas, nenhuma fingida).

Produto desktop (Electron) + API (Fastify) + web (React) no mesmo monorepo.
A marca guarda-chuva é **NEXORA**; o serviço de nuvem existente, **Nexora
Cloud**, é outro repositório, integrado num lote futuro por um cliente
dedicado (`docs/ARCHITECTURE.md` D7).

## 2. Estrutura

```
.
├── apps/
│   ├── api/          # @nexora/api — Fastify 5 + Drizzle + PostgreSQL (+ modo memória)
│   ├── web/          # @nexora/web — React 19 + Vite + Tailwind (leitura da biblioteca)
│   └── desktop/      # @nexora/desktop — Electron 42 (shell, importação local, runner)
├── packages/
│   ├── core/         # @nexora/core — domínio puro: catálogo, busca, planos, armazenamento
│   ├── protocol/     # @nexora/protocol — contrato HTTP/WS (envelope, paginação, futuro)
│   ├── download/     # @nexora/download — interface do motor (só tipos nesta fase)
│   ├── runner/       # @nexora/runner — interface + runner local (spawn + medição real)
│   ├── cloud/        # @nexora/cloud — cliente de saves e cliente Nexora Cloud (futuro)
│   └── ui/           # @nexora/ui — tokens de tema, i18n PT-BR/EN e componentes
├── docs/             # ARCHITECTURE.md, ROADMAP.md, LEGAL.md
└── .github/workflows/# ci.yml (typecheck + teste + SBOM + scan)
```

## 3. Como rodar

| Comando | O que faz |
| --- | --- |
| `pnpm install` | dependências do workspace (a lista de builds permitidos está em `pnpm-workspace.yaml`) |
| `pnpm typecheck` | `tsc --noEmit` em todos os projetos |
| `pnpm test` | todos os projetos de teste (Vitest 4, `test.projects` na raiz) |
| `pnpm build` | compila packages, API, web e desktop |
| `pnpm --filter @nexora/desktop package` | empacota AppImage + deb (`--publish never`) |
| `pnpm --filter @nexora/desktop package:all` | empacota Linux + Windows — no Windows, se o prefixo do Wine do sistema estiver quebrado, usar `WINEPREFIX=~/wine-build` (prefixo completo) |

Requer Node >= 24 e pnpm 12 (`packageManager` fixado no `package.json`).
Contentores (opcionais — a API corre sem eles, em modo degradado):

```bash
docker-compose up -d          # v1: `docker compose` v2 não existe neste ambiente
```

Para desenvolver o desktop com o renderer: `pnpm --filter @nexora/desktop dev`
(compila o main/preload com `tsc` e o renderer com `vite`, e abre o Electron).

## 4. Convenções de código

- TypeScript estrito (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
  **Proibido `any`.**
- ESM (`"type": "module"`, `module: NodeNext`) — imports relativos com extensão `.js`.
- **Código e identificadores em inglês**; comentários, mensagens de domínio e
  textos de interface em **português**.
- Zod para validar entradas externas; sem Zod onde o tipo já basta.
- O renderer **nunca** importa módulos do Node: a fronteira é o `window.nexora`
  do preload (`apps/desktop/src/shared/preload-api.ts`).
- Ficheiros até ~250 linhas; funções pequenas e coesas.
- i18n: dicionário **plano** pt-BR/en; chave em falta no EN é erro de compilação.
- Tema = tokens de papel (`--paper-*`); nenhum componente tem cor própria.
- Commits em Conventional Commits, mensagem em português, um por lote verificado.

## 5. Regras de escopo e honestidade

1. **Nada anunciado antes de existir.** Módulos futuros levam o selo
   "Planeado" e uma explicação do que falta — nunca um botão que finge
   funcionar.
2. **A NEXORA não hospeda nem redistribui jogos.** O launcher lê pastas
   locais do utilizador. Não implementa, não promete e não documenta contorno
   de proteções (Denuvo) ou anticheat. Ver `docs/LEGAL.md`.
3. **A medida é real.** O tempo jogado nasce de um processo filho verdadeiro
   (`LocalGameRunner`), com código de saída guardado. Nada de números
   inventados; a sincronização com a conta é fase futura, e a interface diz-o.
4. **Um limite anunciado é aplicado.** Planos e cotas entram com a sua regra
   e o seu teste — não só com o texto na interface.
5. Recurso de outro utilizador devolve **404**, nunca `403`. Escritas
   auditadas; leituras não.
6. Erro do cliente (paginação inválida, corpo malformado) devolve `4xx` com
   o envelope do contrato, nunca `500`.
7. **Uma falha de arranque nunca é silenciosa** — o `bootstrap` do desktop
   mostra o motivo (`dialog.showErrorBox`) e sai com código != 0.
8. Nenhum segredo no repositório (`.env.example` com placeholders).
9. Uma task só está concluída com `pnpm typecheck`, `pnpm test`, build e
   **prova de execução real** registada em `docs/ROADMAP.md`.
10. **Mexer num `packages/*` obriga a reconstruí-lo** (`pnpm --filter
    @nexora/ui build`) antes de provar o desktop: o renderer consome o `dist`,
    e uma chave nova só no `src` faz o `translate` falhar e a árvore React
    desaparecer (ecrã branco sem erro visível).