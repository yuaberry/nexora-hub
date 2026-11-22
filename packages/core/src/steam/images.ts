/**
 * Imagens da Steam — o que a biblioteca local do utilizador tem.
 *
 * A Steam guarda as imagens de cada jogo em
 * `appcache/librarycache/<appid>/`: o `logo.png`, a `library_hero.jpg`, a
 * `library_capsule.jpg` e a `header.jpg`. Algumas têm nomes de hash (a cápsula
 * principal) — essas são classificadas honestamente como "outras", nunca
 * adivinhadas como herói.
 *
 * O launcher usa-as como capa: a imagem é **do utilizador**, não descarregada
 * de lado nenhum, e por isso funciona offline — que é o ponto.
 */

/** O papel de uma imagem (o que ela é, pelo nome que a Steam lhe deu). */
export type SteamImageRole =
  | 'logo'
  | 'hero'
  | 'capsule'
  | 'header'
  | 'blur'
  | 'other';

/** Uma imagem encontrada na pasta de um jogo. */
export interface SteamImage {
  /** Caminho absoluto do ficheiro. */
  readonly path: string;
  readonly role: SteamImageRole;
  /** Tamanho em bytes (a interface pode mostrar o que escolheu). */
  readonly bytes: number;
}

/**
 * O papel de uma imagem pelo nome do ficheiro.
 *
 * Os nomes fixos da Steam mandam; o que não tem nome conhecido é `other` —
 * incluindo as cápsulas com nome de hash, que são a imagem principal da
 * biblioteca mas cujo nome a Steam não declara.
 */
export function steamImageRole(fileName: string): SteamImageRole {
  const name = fileName.toLowerCase();
  if (name === 'logo.png') {
    return 'logo';
  }
  if (name === 'library_hero.jpg') {
    return 'hero';
  }
  if (name === 'library_capsule.jpg') {
    return 'capsule';
  }
  if (name === 'header.jpg') {
    return 'header';
  }
  if (name === 'library_hero_blur.jpg') {
    return 'blur';
  }
  return 'other';
}

/**
 * A ordem de preferência para a capa.
 *
 * O **logo** vem primeiro: é a arte do jogo com fundo transparente, e por
 * isso desenha-se bem em qualquer tema (claro, escuro, OLED, preto e branco).
 * O herói e a cápsula vêm a seguir; o desfoque e o "outras" por último, porque
 * um desfoque como capa seria uma escolha pobre feita em silêncio.
 */
const COVER_PRIORITY: readonly SteamImageRole[] = ['logo', 'hero', 'capsule', 'header', 'other', 'blur'];

/** A melhor capa entre as imagens (`null` quando não há nenhuma). */
export function pickCover(images: readonly SteamImage[]): SteamImage | null {
  let best: SteamImage | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const image of images) {
    const rank = COVER_PRIORITY.indexOf(image.role);
    if (rank === -1) {
      continue;
    }
    // A empate, a maior: entre duas imagens do mesmo papel, a maior costuma
    // ser a de melhor qualidade.
    if (rank < bestRank || (rank === bestRank && best !== null && image.bytes > best.bytes)) {
      best = image;
      bestRank = rank;
    }
  }
  return best;
}

/** As alternativas para a personalização (tudo menos a escolhida). */
export function coverAlternatives(images: readonly SteamImage[], chosen: SteamImage | null): readonly SteamImage[] {
  if (chosen === null) {
    return [];
  }
  return images
    .filter((image) => image.path !== chosen.path)
    .sort((left, right) => {
      const leftRank = COVER_PRIORITY.indexOf(left.role);
      const rightRank = COVER_PRIORITY.indexOf(right.role);
      return leftRank - rightRank || right.bytes - left.bytes;
    });
}