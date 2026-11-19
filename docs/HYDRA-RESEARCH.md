# NEXORA HUB vs Hydra Launcher — análise e decisões

> Leitura do repositório `hydralauncher/hydra` (main, 2026-11-19): Electron +
> React + TypeScript + Rust (`hydra-native` com libtorrent), MIT, ~8 500
> commits, 17,8k estrelas. Análise feita para **decidir o que incorporar** —
> nunca para copiar: a marca, o desenho e as regras do NEXORA HUB são próprios.

## 1. O que o Hydra tem e o NEXORA HUB já tem

| Capacidade (Hydra) | NEXORA HUB hoje | Veredicto |
| --- | --- | --- |
| Biblioteca com colecções, favoritos, pins | Biblioteca local, favoritos, pesquisa por sílabas | **Adoptar colecções** (simples, pedido desde o briefing) |
| Digitalizar discos por jogos instalados | Detecção de pastas comuns | **Adoptar scan de discos** (mesmo motor de detecção) |
| Medição de tempo jogado | ✅ real (processo filho, código de saída) | Já superior em rigor |
| Sugestões de catálogo | ✅ `searchGames` (sílabas/vogais/consoantes) | Equivalente |
| Reviews | ✅ API + web (1–10, categorias) | **Adoptar a regra "reviewar só depois de jogar"** (anti-spam) |
| Downloads com fila, pausa/retoma, seeding | ✅ HTTP multi-conexão + verificação SHA-256 | **Adoptar extracção automática** (zip/rar após verificar) |
| Saves na nuvem com resolução de conflitos | ✅ snapshots versionados + `decideSync` (local) | Já equivalente no núcleo; nuvem fica adiada (D7 revista) |
| Perfis, amigos, chat | Planejado (exige conta no launcher) | Fase própria |
| Conquistas | Planejado | Fase própria |
| Big Picture, plugins (Decky), temas | Planejado | Fases próprias |

## 2. O que incorporamos (por ordem de valor)

1. **Atalhos de desktop e Steam** — criar atalho para qualquer jogo da
   biblioteca (barra de acções do jogo). Barato, útil, sem dependências.
2. **Scan de discos por jogos instalados** — varrer pastas comuns e discos
   seleccionados com o detector de executáveis que já temos.
3. **Colecções** — agrupar jogos (pedido original do briefing; a API de
   biblioteca já tem o contrato).
4. **Regra "reviewar depois de jogar"** — a API passa a exigir tempo mínimo de
   sessão antes de aceitar review (regra declarada + teste).
5. **ProtonDB rating antes de instalar** — consulta pública, mostrada na
   interface **como dado externo** (com link e data da consulta).
6. **Extracção automática após verificação** — zip/rar/7z, sempre **depois**
   do checksum passar (nunca extrair o que não foi verificado).
7. **Detecção de emuladores** (RetroArch, Dolphin, PCSX2, RPCS3, DuckStation,
   PPSSPP, shadPS4) para a biblioteca unificada de clássicos.
8. **Modo Big Picture** — layout de 3 metros para TV/handheld (fase futura).

## 3. O que deliberadamente **não** copiamos

- **O catálogo de fontes do Hydra** — a lista inclui sites de conteúdo não
  licenciado; o NEXORA HUB mantém a arquitectura de manifestos com attestation
  (`docs/LEGAL.md`) e **não** distribui nem recomendamos essas fontes.
- **Dependências pesadas sem need**: Rust/libtorrent nativo fica para quando o
  cliente de torrent entrar (decisão de build própria); o site do Hydra não é
  replicado — o nosso é inspirado no gesto, com marca e conteúdo próprios.
- **"Steam shortcuts"** só com jogos non-Steam (não fingimos integração com a
  Steam sem a API oficial).

## 4. Onde isto entra no roadmap

- **Fase 6 — Biblioteca++**: atalhos, scan de discos, colecções, regra de
  review, ProtonDB, extracção automática.
- **Fase 7** — emuladores + clássicos.
- **Fase 8** — Big Picture, perfis/temas.
- Fases anteriores (conta no launcher, loja, desempenho) mantêm-se.