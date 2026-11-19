# NEXORA HUB

> **Launcher de jogos da NEXORA.** A sua biblioteca de jogos, num só lugar.

O NEXORA HUB é o launcher de jogos da empresa NEXORA: reúne o que o utilizador
**já tem** instalado no computador, encontra rápido (por nome, sigla ou só as
consoantes), inicia e mede o tempo jogado — com a interface a crescer por
fases, sem nunca anunciar o que não existe.

**O que este repositório é, nesta fase:**

| Peça | Estado |
| --- | --- |
| App de desktop (Electron 42) | **Funcional**: biblioteca local, importação de pastas, pesquisa dinâmica, início de jogos com medição, configurações de dispositivo |
| API (Fastify + PostgreSQL) | **Funcional**: autenticação completa (senha + MFA + refresh rotativo), biblioteca, pesquisa, sessões |
| Web (React) | **Funcional**: leitura da biblioteca, login, admin esqueleto — PT-BR/EN |
| Biblioteca local, Downloads (HTTP verificado), pesquisa, medição, snapshots de saves, interface estilo launcher | **Funcional** |
| Saves na nuvem (Nexora Cloud — adiada pelo responsável), amigos, loja, overlay, Remote Play, torrent | **Planejados** — só interface/tipos + selo "Planeado" |

> **Nada aqui finge funcionar.** Um módulo que ainda não existe aparece com o
> selo "Planeado" e a explicação do que falta. **A NEXORA não hospeda nem
> redistribui jogos**: o launcher lê pastas locais do utilizador. Não há
> contorno de proteções (Denuvo) nem de anticheat — ver [`docs/LEGAL.md`](docs/LEGAL.md).

## Estado verificado (Fase 1, 2026-11-17)

| Verificação | Resultado |
| --- | --- |
| `pnpm typecheck` | limpo nos 10 projetos |
| `pnpm test` | **261 testes verdes**, 2 ignorados (exigem PostgreSQL real) |
| `pnpm build` | packages, API, web e desktop compilados |
| Empacotamento | `nexora-hub-0.1.0-x86_64.AppImage` e `nexora-hub-0.1.0-amd64.deb` construídos (`--publish never`) |
| App real (Electron no DISPLAY=:0) | barra superior estilo launcher, herói com a última sessão, "Continuar a jogar", Downloads com barras de progresso — ver abaixo |
| Pesquisa viva | escrever **"l"** sugere **"League Of Legends"** (motor `searchGames` de `@nexora/core`) |
| Ciclo completo | `launch` via preload → IPC → `LocalGameRunner` spawn → fim natural → **tempo gravado** na base local (acumulado entre sessões) |
| Executável empacotado | AppImage abre com a interface completa e a biblioteca local (BD em `~/.config/NEXORA HUB`) |
| Armazenamento | `usage` devolve medidas reais do volume (982 GB total / 563 GB livres) |

Prova registada em [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

Monorepo **pnpm**; TypeScript estrito sem `any`; ESM NodeNext.

- **Desktop**: Electron 42 — `contextIsolation`, `sandbox`, CSP restritiva,
  protocolo interno `nexora://` (o renderer nunca fala com a rede directamente).
- **API**: Fastify 5 + Drizzle + PostgreSQL 16 (modo degradado em memória sem
  banco) + Redis/TOTP/refresh rotativo espelhados do Nexora Cloud.
- **Web**: React 19 + Vite + Tailwind 4 — o mesmo build serve de base do
  renderer do desktop quando faz sentido.
- **Domínio**: `@nexora/core` (busca, planos, armazenamento), `@nexora/runner`
  (arranque + medição), `@nexora/ui` (tokens, i18n).

## Como rodar

```bash
pnpm install                          # ver pnpm-workspace.yaml para os builds permitidos
docker-compose up -d                  # opcional: PostgreSQL/Redis/MinIO (modo v1)
pnpm --filter @nexora/api dev         # API em 127.0.0.1:3100
pnpm --filter @nexora/desktop dev     # app Electron (compila main, preload e renderer)
```

Requer **Node >= 24** e **pnpm 12**.

## Estrutura

```
apps/api          # autenticação, biblioteca, pesquisa, sessões
apps/web          # interface web (leitura)
apps/desktop      # launcher Electron (shell, importação local, runner)
packages/core     # domínio puro — testável sem infraestrutura
packages/protocol # contrato HTTP/WS
packages/runner   # interface + runner local (spawn + medição real)
packages/ui       # tokens de tema, i18n, componentes
docs/             # ARCHITECTURE.md, ROADMAP.md, LEGAL.md
```

## Privacidade e legal

- O executável **não guarda credenciais** da API; o tempo jogado é medido
  localmente e sincronizar com a conta é fase futura.
- A NEXORA não distribui jogos: a importação lê pastas que o utilizador já
  tem. Posição legal completa em [`docs/LEGAL.md`](docs/LEGAL.md).
- Nenhum segredo no repositório: só `.env.example` com placeholders.