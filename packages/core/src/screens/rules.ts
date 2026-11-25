/**
 * Capturas de ecrã — as regras antes do clique.
 *
 * Uma captura guarda um momento: o nome do ficheiro, onde fica, e o que a
 * nuvem aceita. Tudo aqui é puro — testado sem tocar no ecrã nem na rede.
 *
 * - o nome do ficheiro é **do jogo e do instante** (duas capturas no mesmo
 *   segundo do mesmo jogo são a mesma memória, e uma substitui a outra);
 * - o tamanho tem limite declarado — um PNG de 40 MB não sobe sem saber;
 * - a pasta é a do jogo, dentro das capturas do utilizador — capturas de
 *   jogos diferentes não se misturam.
 */

/** A pasta das capturas dentro dos dados do utilizador. */
export const SCREENSHOTS_DIRECTORY = 'screenshots';

/** O maior ficheiro de captura aceite (20 MB — um PNG 4K comprimido). */
export const MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024;

/** As extensões de imagem aceites. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

/**
 * O nome do ficheiro de uma captura.
 *
 * `<jogo>-<ISO compacto>.png` — o jogo em minúsculas sem espaços (um nome de
 * pasta não pode ter espaços nem barras), e o instante em UTC. A chave do
 * jogo costuma ser um caminho: o que dá o nome é o **último segmento**
 * (`/home/user/games/Hollow Knight` → `hollow-knight`), não o caminho
 * inteiro.
 */
export function screenshotFileName(gameKey: string, at: string): string {
  const slug = slugOf(gameKey);
  const stamp = at.replace(/[:.]/g, '-');
  return `${slug}-${stamp}.png`;
}

/** O nome do jogo em minúsculas, sem espaços nem barras. */
function slugOf(gameKey: string): string {
  const name = gameKey.split('/').filter((part) => part !== '').pop() ?? gameKey;
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(-40) || 'jogo'
  );
}

/** Uma captura é aceitável? (extensão e tamanho). */
export function isScreenshotAcceptable(fileName: string, sizeBytes: number): boolean {
  if (sizeBytes > MAX_SCREENSHOT_BYTES) {
    return false;
  }
  const lower = fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** A pasta das capturas de um jogo (relativa à raiz das capturas). */
export function screenshotFolder(gameKey: string): string {
  return slugOf(gameKey);
}