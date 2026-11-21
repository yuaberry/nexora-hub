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

## D21 — Snapshot é imutável, e a revisão nunca é reutilizada

Um snapshot de save é uma **versão**: cria-se outro, nunca se edita o
existente. A revisão é `max + 1` por jogo — dois snapshots nunca partilham
número, e a decisão de sincronização (`decideSync`) fica estável. A restauração
substitui o conteúdo da pasta de destino, e a interface oferece criar um
snapshot antes: quem quer guardar o estado actual não o perde por engano.

## D22 — A pasta de saves é dita, não adivinhada

Nesta fase a pasta de saves é a pasta de instalação — **mostrada na
interface**, não escondida. Pastas configuráveis por jogo (e detecção por
motor de jogo) são a fase seguinte: adivinhar o caminho e restaurar no sítio
errado seria corromper o progresso de quem joga.

## D23 — O checksum agregado tem limite declarado

O checksum de uma pasta de saves lê o conteúdo dos ficheiros até 8 MB cada
(`MAX_CONTENT_BYTES_PER_FILE`); acima disso, compara caminho + tamanho. O
limite é declarado no código e na interface, não silencioso: um save grande
não pode ser lido inteiro a cada sessão, e fingir seria mentir.

## D24 — A interface é a pele do produto

Barra superior (não sidebar), herói com a última sessão, "Continuar a jogar",
grelha de cartões com overlay de jogar, barras de progresso reais. Nada de cor
própria: só tokens de papel. Nada de animação que ignore "reduzir movimento"
(o CSS usa `--paper-motion`, que é 0 ms nesse modo). O módulo planeado não
entra na navegação principal — fica numa linha "Em breve".

## D25 — O limite de plano é do domínio, aplicado pelo servidor

Os limites dos planos (hotbars, membros da família) vivem em
`packages/core/plans` como função pura, e a **API** é que os aplica — a
interface mostra o que o plano dá, e o servidor recusa o que ele não dá.
`null` significa "sem limite", nunca um número gigante a fingir. Testada a
regra, testada a recusa (409), nas duas implementações de repositório.

## D26 — Um grupo familiar é um estado, não uma tabela com lógica

As transições do grupo (criar, convidar, aceitar, remover, dissolver,
expirar) são funções puras em `packages/core/family/state.ts`: recebem o
estado e os argumentos (relógio e identificadores incluídos) e devolvem um
estado novo ou o motivo da recusa. A API apenas carrega o estado da base,
aplica a transição e persiste — a mesma regra corre contra memória e
PostgreSQL, e os testes do domínio não precisam de infraestrutura.

## D27 — Convite pendente ocupa lugar

Os convites pendentes contam para o limite do plano: sem isso, uma pilha de
convites furaria o teto antes de alguém aceitar. O lugar é devolvido quando
o convite é aceite, recusado ou expira — e a expiração (7 dias) é verificada
a aceitar, com a marca persistida na recusa.

## D28 — A migração acompanha o esquema

Bug real encontrado neste lote: as tabelas `comments`, `reviews` e
`wishlists` existiam no esquema Drizzle mas **não** na migração 0000 — os
repositórios PostgreSQL escreveriam contra tabelas inexistentes, e os testes
de integração (ignorados sem `DATABASE_URL`) não cobriam essas rotas. A
partir daqui: mexer no esquema obriga a gerar migração e a provar a suite de
integração contra uma base real. A migração 0001 criou as tabelas em falta e
as da família; um teste de integração escreve comunidade, desejos e família
sobre a base real para que o buraco não volte em silêncio.

## D29 — A identidade da entrada é o caminho resolvido

O identificador estável de um jogo local é o caminho da pasta — mas
**resolvido** (`realpath`), não apenas normalizado. A prova real apanhou o
buraco: `~/.steam/steam` é um simlink de `~/.local/share/Steam`, e o mesmo
jogo chegava por dois caminhos com duas chaves diferentes — a biblioteca
mostrava "Hollow Knight" e "Hollow Knight", "REPO" e "R.E.P.O.". Um caminho
que não existe (pasta desmontada) fica normalizado: a chave não muda por a
pasta ter desaparecido.

## D30 — A importação oficial lê manifestos, não a Internet

A importação oficial lê os ficheiros que a **Steam** escreveu no disco
(`libraryfolders.vdf` e `appmanifest_<appid>.acf`): o título real do jogo
(`REPO` → `R.E.P.O.`) e o executável detectado na pasta declarada pelo
manifesto. O parser (`packages/core/importers`) é escrito contra o formato
verificado numa instalação real — não contra um formato imaginado — e recusa
um manifesto partido em vez de inventar metade de uma entrada. Epic e GOG
entram no relatório como **formato local por verificar**: não há manifesto
confirmado para as suas ferramentas em Linux, e a interface diz-o em vez de
fingir uma importação que não existe.

## D31 — O prefixo Wine tem de existir antes do spawn

O Wine faz `chdir` para a pasta do prefixo e **morre com código 1** se ela
não existir — e o `spawn` não cria directorias. O plano de arranque
(`resolveLaunchPlan`) é puro e não faz I/O; quem arrancar cria a pasta
antes (`ensureWinePrefix`, no desktop). O caminho é construído por
`winePrefixPath`, exportado do `@nexora/runner`, para que o plano e quem
prepara o disco calculem a **mesma** pasta. O sintoma sem a correcção era o
pior possível: o jogo "arrancava", morria em milissegundos, e a sessão
fechava sem uma única mensagem de erro.

## D32 — Handoff legítimo, não emulação de autenticação

Um jogo comprado numa loja corre nessa loja — e o caminho correcto para
isso é o **handoff**: `steam://rungameid/<appid>`, o protocolo que o próprio
cliente da Steam registou no sistema. Aberto, o jogo corre pela loja, com a
licença do utilizador, o Proton escolhido por ela e os servidores oficiais.
O que o launcher **não** faz, em nenhuma fase: emular autenticação, fingir
uma licença, ligar cópias sem licença a servidores oficiais nem usar
"online-fix" de terceiros — é contorno de protecção técnica (DMCA,
Directiva 2001/29/CE) e facilita a infracção de direitos de autor. A
fronteira está escrita em `docs/LEGAL.md`, e a interface só oferece o
caminho legítimo: jogar com o que o utilizador tem, ou abrir na loja onde
comprou.

## D33 — Presença é um coração que bate, não um interruptor

"Online" não é um estado que se declara: é um **heartbeat com validade**
(`PRESENCE_TTL_SECONDS` = 45 s). Quem passou desse tempo sem bater aparece
offline — mesmo que o processo tenha morrido sem avisar. O launcher bate
imediatamente ao lançar um jogo (com o jogo em curso), repete a cada 30 s
enquanto a sessão dura, e bate com `null` quando ela acaba: quem estava a
ver vê o amigo perder o jogo, não a pessoa desaparecer. Nada de estado
zumbi a mostrar "a jogar" quem fechou o launcher há uma hora.

## D34 — Só amigos vêem a presença, e o token vive dentro da sessão

A presença de um estranho **não existe** nesta API: a rota devolve apenas os
amigos. O token da conta chega ao processo principal no lançamento e vive só
dentro da sessão — sem conta, não há presença (é honesto: a presença é da
conta, não do computador). O pedido de amizade é unidireccional na
aceitação — só quem recebeu aceita ou recusa — e um recurso de outro
utilizador devolve 404, nunca 403 (não confirma existência).

## D7 (revista, 2026-11-18) — Nexora Cloud adiada

O responsável adiou a integração com o Nexora Cloud: o launcher segue sozinho.
A costura técnica mantém-se fechada (`packages/cloud` com `decideSync` e o
cliente *stub* que recusa com motivo) — nada na interface anuncia a nuvem como
existente.
