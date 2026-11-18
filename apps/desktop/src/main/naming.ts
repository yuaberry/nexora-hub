/**
 * Nomes e identificadores de entradas locais.
 *
 * O launcher trabalha com o que o utilizador **já tem**: uma pasta com um
 * nome. O título vem do nome da pasta — nunca inventado, nunca consultado em
 * serviço externo — e o identificador estável é o caminho normalizado, para
 * que importar a mesma pasta duas vezes não duplique a entrada.
 */

import { basename, normalize, sep } from 'node:path';

/**
 * Identificador estável de uma pasta instalada.
 *
 * Normaliza separadores e caixa: o mesmo jogo encontrado por caminhos
 * diferentes (`C:\Games\X` e `c:/games/x`) é a mesma entrada.
 */
export function externalKeyFor(installPath: string): string {
  return normalize(installPath).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * Título legível a partir do nome da pasta.
 *
 * `league-of-legends_v2` → `League Of Legends V2`. Pontos e underscores viram
 * espaços; cada palavra fica com a inicial em maiúscula — excepto as que o
 * utilizador escreveu em maiúsculas completas (siglas como `gta` ficam
 * `Gta`, o que é aceitável: o título é editável na fase de importação).
 */
export function prettyFolderName(installPath: string): string {
  const withoutSeparators = normalize(installPath).replace(/[/\\]+$/, '');
  // Raiz de disco (`C:`, `/`): não há nome de pasta a mostrar.
  if (withoutSeparators === '' || /^[a-zA-Z]:$/.test(withoutSeparators)) {
    return 'Jogo local';
  }
  const raw = basename(withoutSeparators);
  if (raw === '' || raw === '.' || raw === '..') {
    return 'Jogo local';
  }
  const spaced = raw
    .replace(/[._\-+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (spaced === '') {
    return 'Jogo local';
  }
  return spaced
    .split(' ')
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}

/** `true` quando um nome de ficheiro parece um executável de jogo. */
export function isExecutableName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.exe') ||
    lower.endsWith('.x86_64') ||
    lower.endsWith('.x86') ||
    lower.endsWith('.appimage') ||
    lower.endsWith('.sh')
  );
}

/**
 * Nomes que **não** são o executável do jogo.
 *
 * Instaladores, desinstaladores e relatórios de erro vivem ao lado do
 * executável e são a causa clássica de um launcher arrancar a coisa errada.
 */
const NON_GAME_EXECUTABLES: readonly RegExp[] = [
  /^unins/i,
  /^uninst/i,
  /^uninstall/i,
  /^setup/i,
  /^install/i,
  /^crash reporter/i,
  /^crashreport/i,
  /^unitycrash/i,
  /^vcredist/i,
  /^dxsetup/i,
  /^dxwebsetup/i,
  /^dotnet/i,
  /^oalinst/i,
  /^redist/i,
  /^notification/i,
  /^eula/i,
  /^readme/i,
  /^config/i,
  /^settings/i,
  /^options/i,
  /^updater?\./i,
  /^patching/i,
  /^activation/i,
];

/** `true` quando o nome pertence à lista de não-jogos. */
export function isNonGameExecutable(name: string): boolean {
  return NON_GAME_EXECUTABLES.some((pattern) => pattern.test(name));
}

/** Se o caminho usa separadores Windows (diagnóstico de importação). */
export function usesWindowsSeparators(path: string): boolean {
  return path.includes('\\') && !path.includes('/');
}

/** Separador de caminhos do sistema (reexportado para os testes). */
export { sep };