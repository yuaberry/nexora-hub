<div align="center">

# ⚡ NEXORA HUB

### O launcher de jogos da NEXORA — a sua biblioteca, num só lugar.

**Linux · Windows** · Desktop nativo (Electron) + API + Web

[![Versão](https://img.shields.io/badge/versão-0.5.0-7c5cff)](https://github.com/yuaberry/nexora-hub/releases)
[![Testes](https://img.shields.io/badge/testes-844%20verdes-2ea44f)](#qualidade)
[![TypeScript](https://img.shields.io/badge/TypeScript-estrito%20sem%20any-3178c6)](https://www.typescriptlang.org/)
[![Plataformas](https://img.shields.io/badge/plataformas-Linux%20%7C%20Windows-0078d6)](#instalação)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-todos%20os%20direitos%20reservados-8b8b8b)](#licença)

[**↓ Transferir**](#instalação) ·
[Funcionalidades](#funcionalidades) ·
[Capturas](#capturas) ·
[Arquitectura](#arquitectura) ·
[Desenvolvimento](#desenvolvimento) ·
[Roadmap](#roadmap)

</div>

---

## O que é

O **NEXORA HUB** é o launcher de jogos da NEXORA. Ele lê as pastas que o
utilizador **já tem** instaladas — inclusive as da Steam, por meio dos
manifestos que a própria Steam escreve no disco — encontra o jogo por nome,
sigla ou só as
consoantes, inicia e **mede o tempo jogado de verdade** (processo filho,
código de saída, tempo gravado).

> ### A regra que rege tudo: nada é anunciado antes de existir.
> Um módulo que ainda não existe aparece com o selo **Planejado** e a razão do
> que falta — nunca um botão a fingir que funciona. A **NEXORA não hospeda nem
> redistribui jogos**: o launcher lê o que está no computador do utilizador.

---

## Funcionalidades

<table>
<tr><td width="50%" valign="top">

### 🎮 Biblioteca e jogos
- **Biblioteca local unificada** com o título real do manifesto da Steam
  (`REPO` → `R.E.P.O.`), executável detectado e capa local
- **Pesquisa por sílabas e consoantes** — `l` encontra *League Of Legends*,
  `mncft` encontra *Minecraft*
- **Início com medição real** — sessão de facto, tempo jogado gravado
- **Jogos Windows no Linux** correm pelo Wine/Proton com prefixo **por jogo**
- **"Abrir na Steam"** — o *handoff* legítimo: o jogo corre pelo cliente
  oficial, com a licença do utilizador e os servidores oficiais

### 📊 Estatísticas e timeline
- Horas jogadas, sessões, jogos distintos, **top de jogos** e género favorito
- **Hora de pico** e histograma por hora
- Timeline real: sessões, comentários, reviews, desejos

### 👥 Social
- **Amigos** — pedidos, aceitar/recusar/cancelar, remover
- **Presença por *heartbeat*** (validade de 45 s): quem joga mostra o jogo —
  *"A jogar Hollow Knight"* — e quem pára de bater fica *offline*
- **Chat** directo entre amigos, com o histórico na API

</td><td width="50%" valign="top">

### 🛠️ Desempenho
- **Medições reais** de CPU, memória, carga e **temperatura** (8 sensores
  lidos de `/proc` e `/sys`) — nada estimado
- **Otimizador** que limpa o que o sistema regenera (cache de miniaturas,
  shaders, lixo), com **ponto de restauro** e o relatório do que saiu
- **GameMode** aplicado no arranque quando está instalado — sem privilégios
- **O que o otimizador recusa está escrito**: governor da CPU, swappiness,
  desactivar serviços e "limpar RAM", cada um com o motivo

### 🏆 Economia
- **Conquistas** avaliadas sobre sessões reais (10 h, 5 jogos, coruja,
  maratona…) com barras de progresso honestas
- **Pontos** com **livro auditável**: o saldo é a soma das entradas

### 🧭 Recomendações
- **Parecidos com um jogo** e **recomendado para si** — a semelhança é a
  sobreposição das etiquetas (Jaccard) ponderada pelo tempo jogado: uma
  **fórmula declarada**, não uma IA fingida
- Cada recomendação traz a razão (as etiquetas partilhadas) e o que já tem na
  biblioteca **não** é recomendado

### 🖼️ Capas e sincronização
- **Capas reais da Steam** — o logo, o herói e a cápsula que a Steam guardou
  no disco do utilizador (offline, sem descarregar nada), escolhidas por uma
  ordem declarada: o **logo** primeiro, porque desenha-se bem em qualquer tema
- **Sincronização** — relê os manifestos da Steam e traz o que mudou (jogos
  novos, todos diferentes); a capa que escolheste **nunca** é mexida
- **Personalizável** — escolhe outra entre as imagens da Steam ou um ficheiro
  teu, e volta à automática quando quiseres

### 🏆 Cosméticos
- **Selos comprados com pontos reais** — a mesma moeda das conquistas e das
  tarefas; nenhum preço inventado e nenhum selo sem pontos
- **O saldo desce no livro** — comprar é uma entrada negativa no livro de
  pontos, com o motivo declarado (`cosmetic.<id>`); comprar duas vezes é
  recusado pela regra **e** pela chave da base
- **O que equipas vê-se** — o selo aparece ao lado do teu nome na barra
  lateral e nas Conquistas, e sai quando o tiras

### 🧩 Plugins
- **Extensões declarativas** — um plugin é um `manifest.json` que declara
  capacidades que o launcher **já sabe aplicar**: não corre código, não
  descarrega jogos e não toca em licenças de loja nenhuma
- **A Steam Integration vem instalada** — sincronizar com os manifestos da
  Steam, hidratar as capas com a arte pública da loja e listar as DLCs
  declaradas; desactivá-la desliga essas três capacidades, e a interface diz
  qual é o interruptor em vez de fingir que a loja falhou
- **Instala o teu** — escolhes um manifesto, ele é validado (a lista de
  capacidades é fechada) e instalado; remover ou desactivar é teu, e o plugin
  da NEXORA volta a aparecer como disponível

### 🔍 Descobrir pelo AppID
- **Adicionar pelo AppID ou pelo nome** — a loja pública da Steam diz quem é
  o jogo; a entrada fica na biblioteca com título, capa e link, **sem
  instalar nada** (a instalação continua a ser da loja oficial)
- **Sem duplicações** — um jogo que já importaste do disco é reconhecido
- **DLCs** — a secção "Conteúdo adicional" mostra as DLCs declaradas pela loja
  e quais estão instaladas no teu disco
- **Capas sempre enquadradas** — logos assentes na moldura, heróis e cápsulas
  a preenchê-la; uma imagem que falhe mostra o placeholder, nunca uma moldura
  vazia

### 🎨 Parede de jogos
- **Capas unificadas** — a cápsula vertical oficial da Steam (`library_600x900`),
  igual para todos os utilizadores, guardada em cache no disco (offline a
  partir da segunda vez)
- **Horas jogadas** em cada cápsula — a medida real do runner, sem números
  inventados
- **A tua escolha manda** — uma capa escolhida por ti nunca é substituída

### 🩺 Diagnóstico
- **Leituras reais** — disco, carga por núcleo, memória e temperatura, com
  limiares declarados (o que é aviso e o que é crítico)
- Uma leitura em falta diz **"sem leitura"** — nunca um número inventado

### 🏅 Reputação
- Níveis declarados (**Bronze → Diamante**) a partir dos pontos reais — sem
  número inventado
- Barra de progresso e o que falta para o próximo nível

### 📺 Remote Play (Moonlight)
- Detecta o cliente **Moonlight** do sistema e encaminha: emparelhar, listar os
  jogos do anfitrião e jogar — o *streaming* é do Moonlight, não do launcher
- Sem o binário, a página diz **"Moonlight não encontrado"** e o que instalar
  (quando instalares, funciona sem mudar código)

### 📊 Widget de sessão
- Uma faixa **sempre ao topo** com o jogo em curso e o relógio da sessão real
- Botão de parar integrado; sem sessão, a janela fecha-se sozinha

### 🛋️ Modo grande ecrã
- **Ecrã inteiro** — a biblioteca desenhada para o sofá: cápsulas grandes,
  herói com a arte, relógio e nada mais
- **Setas para navegar, Enter para abrir, Escape para sair** — sem rato

### ☁️ A tua conta
- **Saves na nuvem** — versões dos dois lados e a decisão de conflito
- **Biblioteca sincronizada** — o metadado da tua biblioteca sobe para a conta
  (título, appid, favorito, tempo medido) e a **web mostra-a**, com a cápsula
  reconstruída a partir do appid; **caminhos locais e executáveis ficam na tua
  máquina** — a conta não precisa de saber onde os ficheiros estão

### ☁️ Saves na nuvem
- **O teu progresso com a conta** — versões dos dois lados (computador e
  nuvem) com a decisão de conflito declarada: em sincronia, à frente de um
  lado, ou **divergente** (aí a escolha é tua)
- **Restaurar é seguro** — um snapshot local de segurança é criado **antes**
  de tocar na pasta; nada se perde
- **A revisão viaja** — enviar leva a revisão e o checksum da tua cópia local,
  para os dois lados compararem-se sem adivinhar

### 🧩 Modos
- **Detector real** — lê os `.jar` da pasta de mods e diz o carregador
- **Instalação em 1 clique** — um `.jar` escolhido entra na pasta do jogo; um
  nome repetido é recusado em vez de substituído em silêncio
- **Detector de modos** — lê a pasta `mods` do jogo e diz **quantos são e de
  que carregador** (Fabric, Quilt, Forge, NeoForge), com o nome e a versão de
  cada um lidos do manifesto dentro do `.jar`
- Um modo desligado (`.jar.disabled`) **não conta**, e um jar sem marcador
  fica **desconhecido** — o total diz a verdade

### 🖥️ Overlay
- **Overlay por cima do jogo** (Shift+Tab) — CPU, memória e temperatura
  **medidos** a cada 2 s, e a sessão em curso; o FPS é declarado **Planejado**
  (medir FPS exige injecção no processo do jogo)

### 🎨 Interface
- **Tema OLED** (preto `#000000` verdadeiro) e **preto e branco**
- Tokens de papel, alto contraste, "reduzir movimento", PT-BR e EN
- **Benchmark medido** — compara a máquina antes e depois de optimizar

</td></tr>
</table>

### O que ainda não existe (e está dito)

Torrent · Saves na nuvem (integração adiada pelo responsável) · Overlay
Shift+Tab · FPS dentro do jogo (exige injecção no processo) · Recomendações
de IA · Remote Play. Cada um aparece na interface com o selo **Planejado**.

---

## Instalação

> **Windows:** o executável **não é assinado** com certificado de código — o
> SmartScreen avisa na primeira execução. A razão é honesta: assinar exigiria
> um certificado comprado por quem opera o projecto.

### Linux

| Formato | Ficheiro | Instalação |
| --- | --- | --- |
| **AppImage** (qualquer distribuição) | `nexora-hub-0.1.0-x86_64.AppImage` | `chmod +x` e executar — sem instalar |
| **.deb** (Debian, Ubuntu, Mint) | `nexora-hub-0.1.0-amd64.deb` | `sudo apt install ./nexora-hub-0.1.0-amd64.deb` |

### Windows

| Formato | Ficheiro | Instalação |
| --- | --- | --- |
| **Instalador NSIS** (x64) | `nexora-hub-0.2.0-x64.exe` | executar e seguir o assistente |

> O macOS **não** é suportado nesta fase.

Os ficheiros de cada lançamento estão em
[**Releases**](https://github.com/yuaberry/nexora-hub/releases) — o mais recente é o
**0.2.0**:

---

## Capturas

<table>
<tr>
<td width="50%"><img src="docs/screenshots/biblioteca.png" alt="Biblioteca"/><br/><sub><b>Biblioteca</b> — os jogos que tem, com o tempo jogado.</sub></td>
<td width="50%"><img src="docs/screenshots/tema-oled.png" alt="Tema OLED"/><br/><sub><b>Tema OLED</b> — preto <code>#000000</code>: num painel OLED o pixel preto está desligado.</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/tema-noir.png" alt="Tema preto e branco"/><br/><sub><b>Preto e branco</b> — nenhum token tem matiz.</sub></td>
<td><img src="docs/screenshots/desempenho.png" alt="Desempenho"/><br/><sub><b>Desempenho</b> — CPU, memória e temperatura medidos de verdade.</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/otimizador.png" alt="Otimizador"/><br/><sub><b>Otimizador</b> — 27,9 MB medidos em cache, com o custo de cada limpeza.</sub></td>
<td><img src="docs/screenshots/amigos.png" alt="Amigos"/><br/><sub><b>Amigos</b> — presença por <i>heartbeat</i>: quem joga mostra o jogo.</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/chat.png" alt="Chat"/><br/><sub><b>Chat</b> — conversas directas entre amigos, histórico na API.</sub></td>
<td><img src="docs/screenshots/conquistas.png" alt="Conquistas"/><br/><sub><b>Conquistas</b> — progresso real e livro de pontos.</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/benchmark.png" alt="Benchmark"/><br/><sub><b>Benchmark</b> — pontuação medida, nunca estimada (997,8 nesta máquina).</sub></td>
<td><img src="docs/screenshots/familia.png" alt="Família"/><br/><sub><b>Família</b> — grupo com limite de plano e biblioteca partilhada.</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/mods.png" alt="Modos"/><br/><sub><b>Modos</b> — 42 modos detectados, com o carregador de cada um.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/cosmetics.png" alt="Cosméticos"/><br/><sub><b>Cosméticos</b> — selos comprados com pontos reais, equipados ao lado do nome.</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/overlay.png" alt="Overlay"/><br/><sub><b>Overlay</b> — medidas reais por cima do jogo (Shift+Tab).</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/capas-steam.png" alt="Capas da Steam"/><br/><sub><b>Capas reais</b> — os logos que a Steam guardou, lidos do disco.</sub></td><td><img src="docs/screenshots/dlcs-steam.png" alt="DLCs"/><br/><sub><b>DLCs</b> — nomes da loja, instaladas do disco.</sub></td><td><img src="docs/screenshots/catalogo-appid.png" alt="Adicionar por AppID"/><br/><sub><b>Adicionar por AppID</b> — metadado na biblioteca, instalação na loja.</sub></td><td><img src="docs/screenshots/parede-capsulas.png" alt="Parede de jogos"/><br/><sub><b>Parede de jogos</b> — cápsulas verticais iguais em qualquer máquina.</sub></td><td><img src="docs/screenshots/home-capsulas.png" alt="Início"/><br/><sub><b>Início</b> — a mesma parede, da tua biblioteca.</sub></td><td><img src="docs/screenshots/saves-nuvem.png" alt="Saves na nuvem"/><br/><sub><b>Saves na nuvem</b> — os dois lados e a decisão de conflito.</sub></td><td><img src="docs/screenshots/inicio-prateleiras.png" alt="Início"/><br/><sub><b>Início</b> — destaque com arte e prateleiras da tua biblioteca.</sub></td><td><img src="docs/screenshots/detalhes-heroi.png" alt="Detalhes"/><br/><sub><b>Detalhes</b> — a arte do jogo como cabeçalho.</sub></td><td><img src="docs/screenshots/modo-grande-ecra.png" alt="Modo grande ecrã"/><br/><sub><b>Modo grande ecrã</b> — a biblioteca a dez pés, com setas e Enter.</sub></td><td><img src="docs/screenshots/detalhe-galeria.png" alt="Galeria"/><br/><sub><b>Página do jogo</b> — herói com arte desfocada e galeria das imagens da Steam.</sub></td><td><img src="docs/screenshots/detalhe-sobre.png" alt="Sobre"/><br/><sub><b>Sobre</b> — a descrição real da loja, guardada para uso offline.</sub></td><td><img src="docs/screenshots/forum.png" alt="Fórum"/><br/><sub><b>Fórum</b> — tópicos e respostas por jogo, com conta NEXORA.</sub></td><td><img src="docs/screenshots/clans.png" alt="Clãs"/><br/><sub><b>Clãs</b> — grupos com dono, oficiais e convites por email.</sub></td><td><img src="docs/screenshots/eventos.png" alt="Eventos"/><br/><sub><b>Eventos</b> — encontros marcados, com lotação aplicada.</sub></td>
<td><img src="docs/screenshots/capa-personalizacao.png" alt="Capa personalizável"/><br/><sub><b>Capa personalizável</b> — escolhe entre as imagens da Steam ou um ficheiro teu.</sub></td>
<td><img src="docs/screenshots/estatisticas.png" alt="Estatísticas"/><br/><sub><b>Estatísticas</b> — agregadas no servidor a partir das sessões reais.</sub></td>
<td><img src="docs/screenshots/estatisticas.png" alt="Estatísticas"/><br/><sub><b>Estatísticas</b> — agregadas no servidor a partir das sessões reais.</sub></td>
</tr>
</table>

---

## Arquitectura

Monorepo **pnpm** com TypeScript estrito (**sem `any`**, ESM `NodeNext`):

```
apps/
├── api/        Fastify 5 + Drizzle + PostgreSQL (com modo degradado em memória)
├── desktop/    Electron 42 — shell, importação local, runner, telemetria
├── web/        React 19 + Vite (leitura da biblioteca, comunidade)
└── site/       página pública
packages/
├── core/       domínio puro: catálogo, busca, planos, stats, social,
│               chat, conquistas, benchmark, telemetria, importadores
├── protocol/   contrato HTTP/WS (envelope, paginação, eventos)
├── download/   motor HTTP multi-conexão com verificação por checksum
├── runner/     plano de arranque + runner local (spawn e medição reais)
├── sources/    manifestos declarativos com attestation legal
├── cloud/      snapshots de saves e `decideSync` (integração adiada)
└── ui/         tokens de tema, i18n PT-BR/EN e componentes
```

**Decisões que não se mudam** (a lista completa em
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):

- **Um limite anunciado é aplicado** — planos e quotas entram com a regra e o
  teste, não só com o texto na interface.
- **A medida é real** — tempo jogado, telemetria e benchmark vêm do sistema.
- **Recurso de outro utilizador devolve `404`**, nunca `403`.
- **Nenhuma cor própria de componente** — só tokens de papel.

## Desenvolvimento

Requer **Node ≥ 24** e **pnpm 12**.

```bash
pnpm install          # dependências do workspace
pnpm typecheck        # tsc --noEmit em todos os projectos
pnpm test             # todos os testes (Vitest, multi-projecto)
pnpm build            # compila packages, API, web e desktop
pnpm --filter @nexora/desktop package:all   # empacota Linux + Windows
```

A API arranca sem contentores em **modo degradado** (dados em memória, diz-no
em `/health`). Com PostgreSQL real, as migrações aplicam-se com
`drizzle-kit` e a suite de integração corre com `DATABASE_URL` definido.

Contribuição: convenções, honestidade e escopo em
[AGENTS.md](AGENTS.md); a fronteira legal em [docs/LEGAL.md](docs/LEGAL.md).

## Qualidade

| | |
| --- | --- |
| **Testes** | **844 verdes** (integração PostgreSQL real incluída) |
| **Typecheck** | estrito, sem `any`, limpo em todos os projectos |
| **Bugs** | corrigidos com teste — cada lote fecha com prova de execução real (último: capas da loja que não carregavam no Electron, logo cortado em moldura retrato, import perdido que silenciava o cache) |
| **Build** | Linux + Windows empacotados a cada versão |

Cada fase do [roadmap](docs/ROADMAP.md) só fecha com `pnpm typecheck`,
`pnpm test`, build e **prova de execução real** registada — incluindo os bugs
que essas provas encontraram (o prefixo do Wine que não era criado, os
symlinks do `/sys`, o `process.execPath` do Electron dentro da app).

## Roadmap

| Fase | Entrega | Estado |
| --- | --- | --- |
| 1 | Fundação, domínio, API, desktop e web | ✅ Concluída |
| 2 | Downloads HTTP com verificação, manifestos, fontes | ✅ Concluída |
| 3 | Nuvem e perfis — **Família**, **importação da Steam**, saves | 🟡 Em curso |
| 4 | Social — **amigos, presença, chat**, loja, desejos, comunidade | ✅ Concluída |
| 5 | Economia — **pontos e conquistas**, estatísticas, timeline | 🟡 Em curso |
| 5b | Comunidade pesada — fóruns, mods, clãs, eventos | ⏳ Planejada |
| 6 | Biblioteca++ — atalhos, scan, colecções | ✅ Concluída |
| 7 | Desempenho — **telemetria e otimizador**, overlay, FPS | 🟡 Em curso |
| 8 | IA NEXORA — **benchmark medido e recomendações**, diagnóstico | 🟡 Em curso |
| 9 | Futuro — Remote Play, Big Picture, widgets | ⏳ Planejada |

O detalhe de cada fase, com as provas, está em [docs/ROADMAP.md](docs/ROADMAP.md).

## Licença

**Todos os direitos reservados.** Software proprietário da NEXORA; a licença
de distribuição é decidida pelo responsável do projecto. Marcas e nomes de
terceiros (Steam, Epic, GOG) pertencem aos seus donos e são usados apenas
para identificar as lojas para onde o utilizador compra.

---

<div align="center">

**NEXORA HUB** · feito pelo Núcleo de Engenharia da NEXORA

<sub>A NEXORA não hospeda nem redistribui jogos. O launcher lê o que o utilizador já tem.</sub>

</div>