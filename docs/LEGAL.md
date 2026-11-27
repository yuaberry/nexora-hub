# NEXORA HUB — Posição legal e de conteúdo

> **Documento de posição, não parecer jurídico.** A revisão por advogado é
> obrigatória antes de qualquer funcionalidade que envolva fontes de terceiros
> (Fase 2) ou pagamentos (Fase 4).

## 1. O que a NEXORA faz e não faz

O NEXORA HUB é um **cliente**: lê pastas de jogos que o utilizador já tem no
computador, inicia o executável e mede o tempo de sessão.

A NEXORA:

- **não executa pagamentos** nem intermedia compras.


## 4. Dados pessoais (LGPD)

- O executável **não guarda credenciais**: o token vive no `sessionStorage`
  da sessão e a base local (SQLite) é do próprio computador.
- O tempo jogado é medido localmente; sincronizar com a conta é fase futura e
  exige consentimento explícito.
- Nenhum telemetria é enviado sem opt-in documentado.
- Retenção e direito de remoção: política própria quando a conta entrar
  (Fase 3), espelhando `docs/DATA_RETENTION.md` do Nexora Cloud.

O que a plataforma garante, para **qualquer** fonte: verificação SHA-256
antes de instalar e verificação dos ficheiros no disco a qualquer momento
(`downloads.verify`). Um ficheiro alterado, substituído ou em falta é
reportado — a medida de segurança é do ficheiro, não da confiança na origem.
Isso não legitima conteúdo sem licença: apenas diz a verdade sobre o que
está no disco.

## 6. Marcas

"NEXORA" e "NEXORA HUB" são marcas da empresa. Nenhum nome, logótipo ou marca
de terceiros (Steam, Epic, GOG, Ubisoft, Battle.net, Nintendo, Discord,
itch.io, Hydra) é usado sem autorização do titular; as integrações futuras
usam as APIs oficiais e os nomes só de forma descritiva.
