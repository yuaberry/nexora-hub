# NEXORA HUB — Arquitectura

Decisões de arquitectura do launcher, na forma de contrato. Uma decisão nova
entra neste ficheiro **no mesmo lote** que o código que a implementa.

## D0 — Decisões de produto (travadas com o responsável, 2026-11-17)

1. Nome: marca **NEXORA**, produto desktop **NEXORA HUB** (o antigo "AetherHub"
   não é usado em nome, código ou interface).
2. Cliente desktop: **Electron 42** (Tauri fica como migração futura de peso,
   documentada — não prometida).
3. Repositório **próprio** (`~/nexora-hub`): o `nexora-cloud` tem regras de
   escopo rígidas e não é modificado; a integração futura é por cliente
   dedicado, não por fusão de repositórios.

## D1 — Desktop-first, web irmã

O launcher é Electron. A web (`/login`, `/biblioteca`, `/admin`) consome a
**mesma** API e os **mesmos** pacotes (`@nexora/ui`, `@nexora/protocol`), sem
duplicar regra de negócio.

## D2 — Domínio puro em `packages/core`

Busca (`searchGames`), normalização (`normalizeText`), planos e barra de
armazenamento são funções puras, testadas sem infraestrutura. O desktop só
orquestra.

## D3 — Entradas locais; sem catálogo fantasma

A biblioteca são as pastas do utilizador. O catálogo curado (`CURATED_GAMES`)
só serve para **enriquecer aliases** de entradas locais — a pesquisa nunca
devolve um jogo que não está instalado.

## D4 — Detecção de executável é heurística e explicável

`rankExecutables` pontua candidatos; instaladores/desinstaladores são
penalizados e nunca escolhidos enquanto existir alternativa. Uma pasta sem
candidato plausível é **recusada** com motivo (`no-executable`) em vez de
arrancar o primeiro ficheiro.

## D5 — Medição real de tempo

O tempo jogado nasce de um processo filho verdadeiro (`LocalGameRunner`), com
código de saída guardado: um `exit != 0` é *crash*, não sessão normal. A soma
vai para a base local (`LocalLibrary.addPlayedSeconds`) quando a sessão
termina naturalmente. **Sincronizar com a conta é fase futura** e a interface
diz-o (selo "Planeado").

## D6 — Fronteira renderer ⇄ main por contrato tipado

`apps/desktop/src/shared/preload-api.ts` é a **fronteira**: o renderer nunca
toca em ficheiros nem processos, só em `window.nexora`. O preload (CommonJS,
`sandbox: true`) expõe exactamente esse contrato; o principal valida cada
argumento (o que vem do renderer é entrada externa). O renderer **não**
importa módulos do Node — nem `node:path`.

## D7 — Nexora Cloud é outro repositório, integrado por cliente

`packages/cloud` guarda a interface do cliente de saves e do Nexora Cloud.
Nesta fase os dois são **tipos**; o streaming não existe e a interface diz
`available: false` com motivo. A fusão de contas (Entrar com Nexora) é lote
futuro, com a auth espelhada da API para a federação ser mecânica.

## D8 — Auth espelhada do Nexora Cloud

`scrypt` + sal por utilizador, lockout atómico em SQL, JWT de 1 h, refresh
**derivado** (`id.hmac`, rotação atómica, família morta por reutilização),
MFA/TOTP com segredo cifrado (AES-256-GCM + HKDF). Decisão: a federação de
contas entre o Hub e o Cloud não pode nascer de dois sistemas incompatíveis.

## D9 — Erro do cliente nunca é 500

Paginação inválida e corpo malformado devolvem `4xx` com o envelope do
contrato. O log de erros internos fica para as falhas verdadeiras.

## D10 — Selos de honestidade

"Planeado" para o que não existe, "Estimado"/"Medido" para números. Nenhum
botão finge funcionar; os módulos futuros vivem na barra lateral com selo e
página explicativa.

## D11 — Portas e esquema

A API é acessível por `NEXORA_API_URL` (omissão `http://127.0.0.1:3100`); o
desktop reencaminha por um esquema interno **privilegiado** registado antes
de `app.ready`, servindo o renderer compilado com *fallback* SPA e recusando
travessia de caminho (`403`).

## Decisões nascidas de bugs reais (Fase 1)

Estas quatro ficam registadas porque cada uma foi um defeito encontrado em
prova real, não uma preferência:

- **D12 — O esquema regista-se pelo nome.** `protocol.handle('nexora', …)`,
  sem `://`: com o sufixo o handler não casa com o esquema do pedido e a
  navegação é abortada (`ERR_ABORTED`) — janela branca, sem erro visível.
- **D13 — A janela carrega a `startUrl` explicitamente.** Sem `loadURL` a
  janela fica em `about:blank` e o `ready-to-show` nunca compõe: a interface
  nunca aparece.
- **D14 — Os caminhos do desktop não dependem do `cwd`.** A raiz é a do
  **pacote** (`packageRoot()`), e a base local de desenvolvimento vive em
  `.dev-data/`. Um caminho dependente do directório de lançamento quebra com
  um clique noutra pasta.
- **D15 — Uma falha de arranque nunca é silenciosa.** O `bootstrap` mostra o
  motivo e sai com código != 0; um launcher que morre calado deixa o
  utilizador a culpar o jogo.
- **D16 — O nome da aplicação é explícito.** `app.setName('NEXORA HUB')` corre
  **antes** de qualquer caminho ser usado: `app.getPath('userData')` deriva do
  nome, e o nome por omissão é o do `package.json` (`@nexora/desktop`) — sem
  isto a base local do executável empacotado ficaria em `~/.config/@nexora`,
  um directório com `@` e o nome do pacote em vez do nome do produto.
## D17 — O manifesto é declarativo, e a attestation é obrigatória

Uma fonte de downloads é um **ficheiro JSON** que descreve o que transferir:
URLs, caminhos, checksums, executáveis declarados e uma declaração de base
legal (`legal.basis`, `attestedBy`, `attestedAt`). Sem attestation, a
instalação é recusada — pelo pacote, não pela interface. A NEXORA não hospeda
nem distribui conteúdo: quem instala o manifesto declara a sua base legal e
responde por ela (`docs/LEGAL.md`).

## D18 — A API serve o catálogo; quem transfere é o cliente

Os ficheiros aterram no disco do utilizador. Por isso o motor
(`@nexora/download`) corre no **processo principal do launcher**, e a API
expõe apenas fontes e pesquisa. Um canal remoto de transferência (Nexora
Cloud) é fase futura, e entra com a sua própria arquitectura.

## D19 — O jogo transferido entra na biblioteca sozinho

Quando as tarefas de um jogo terminam, o executável é escolhido entre os que
o **manifesto declara** (nunca adivinhado), recebe permissão de execução, e a
entrada nasce na biblioteca local. Se nenhum executável declarado existir, o
jogo não entra — antes honestidade do que um lançador que arranca a coisa
errada.

## D20 — Um limite anunciado é aplicado na fila

Espaço em disco verificado **antes** do primeiro byte, checksum verificado
**antes** do rename, e torrent recusado com motivo enquanto o cliente não
existir (`planned`). Torrent e Wine/Proton são Fase 2b: são dependência
nativa e decisão de handoff, não texto de marketing.
