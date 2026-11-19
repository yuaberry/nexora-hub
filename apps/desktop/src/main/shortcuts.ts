/**
 * Atalhos de desktop — um jogo da biblioteca, um atalho no menu do sistema.
 *
 * O launcher corre o executável **do utilizador**: o atalho é um ficheiro
 * `.desktop` que aponta para esse caminho, nada mais. Não há "atalho Steam"
 * fingido — integrar com a Steam exige a API oficial (fase própria).
 *
 * Apenas Linux: noutros sistemas a criação é **recusada com motivo**, em vez
 * de escrever um ficheiro que o sistema não lê.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Dados de um atalho. */
export interface ShortcutRequest {
  /** Nome de exibição (o título do jogo). */
  readonly name: string;
  /** Caminho absoluto do executável. */
  readonly exec: string;
  /** Caminho do ícone (opcional — sem ele, o sistema usa o genérico). */
  readonly icon?: string;
}

/** Resultado da criação de um atalho. */
export type ShortcutResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Constrói o conteúdo de um ficheiro `.desktop`.
 *
 * Função pura: o mesmo pedido dá sempre o mesmo conteúdo — e os testes
 * verificam cada linha sem tocar no disco. `%F` no `Exec` permite passar
 * ficheiros (o que alguns jogos usam), e `Categories=Game` mete o atalho no
 * menu de jogos.
 */
export function buildDesktopEntry(request: ShortcutRequest): string {
  // O `Exec` é sempre o executável do utilizador — o ícone (quando existe)
  // vai na linha própria, nunca dentro do comando.
  const exec = request.exec;
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${escapeValue(request.name)}`,
    `Comment=${escapeValue(`Jogar ${request.name} com o NEXORA HUB`)}`,
    `Exec=${escapeValue(exec)} %F`,
    'Terminal=false',
    'Categories=Game;',
    'StartupNotify=true',
  ];
  if (request.icon !== undefined) {
    lines.push(`Icon=${escapeValue(request.icon)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Caminho do ficheiro do atalho dentro da pasta de aplicações. */
export function desktopFilePath(appsDir: string, name: string): string {
  return join(appsDir, `nexora-hub-${slug(name)}.desktop`);
}

/**
 * Escreve o atalho na pasta de aplicações do utilizador.
 *
 * Cria a pasta se não existir (um sistema sem `~/.local/share/applications`
 * fica com ela criada — é o caminho padrão do XDG).
 */
export function installDesktopShortcut(request: ShortcutRequest, appsDir: string): ShortcutResult {
  try {
    mkdirSync(appsDir, { recursive: true });
    const path = desktopFilePath(appsDir, request.name);
    writeFileSync(path, buildDesktopEntry(request), 'utf8');
    return { ok: true, path };
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : 'Falha ao escrever o atalho.' };
  }
}

/** Nome de ficheiro seguro a partir do título (`:` e `\` não sobrevivem). */
function slug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'jogo'
  );
}

/**
 * Escapa um valor do `.desktop`.
 *
 * O formato não tem escape formal; o que se pode fazer é não escrever
 * newlines (que quebrariam o ficheiro) — daí a substituição.
 */
function escapeValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}