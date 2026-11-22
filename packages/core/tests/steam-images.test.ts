import { describe, expect, it } from 'vitest';
import {
  coverAlternatives,
  pickCover,
  steamImageRole,
  type SteamImage,
} from '../src/steam/images.js';

/** Uma imagem com um caminho e um tamanho. */
function imagem(path: string, bytes = 1000): SteamImage {
  return { path, role: steamImageRole(path.split('/').pop() ?? path), bytes };
}

describe('steamImageRole', () => {
  it('reconhece os nomes que a Steam dá', () => {
    expect(steamImageRole('logo.png')).toBe('logo');
    expect(steamImageRole('library_hero.jpg')).toBe('hero');
    expect(steamImageRole('library_capsule.jpg')).toBe('capsule');
    expect(steamImageRole('header.jpg')).toBe('header');
    expect(steamImageRole('library_hero_blur.jpg')).toBe('blur');
  });

  it('um nome de hash é "outras" — nunca adivinhado como herói', () => {
    expect(steamImageRole('0daf3933d392d7bb7c5a890917e20c917fcc458e.jpg')).toBe('other');
  });

  it('ignora a caixa do nome', () => {
    expect(steamImageRole('LOGO.PNG')).toBe('logo');
  });
});

describe('pickCover', () => {
  it('o logo vem primeiro (arte transparente, boa em qualquer tema)', () => {
    const escolhida = pickCover([
      imagem('x/library_hero.jpg'),
      imagem('x/logo.png'),
      imagem('x/library_capsule.jpg'),
    ]);
    expect(escolhida?.role).toBe('logo');
  });

  it('sem logo, o herói vem antes da cápsula', () => {
    const escolhida = pickCover([
      imagem('x/library_capsule.jpg'),
      imagem('x/library_hero.jpg'),
    ]);
    expect(escolhida?.role).toBe('hero');
  });

  it('o desfoque é o último recurso', () => {
    const escolhida = pickCover([
      imagem('x/library_hero_blur.jpg'),
      imagem('x/qualquer-coisa.jpg'),
    ]);
    expect(escolhida?.role).toBe('other');
  });

  it('a empate no papel, a maior vence (mais qualidade)', () => {
    const escolhida = pickCover([
      imagem('x/logo.png', 500),
      imagem('y/logo.png', 5000),
    ]);
    expect(escolhida?.path).toBe('y/logo.png');
  });

  it('sem imagens não há capa', () => {
    expect(pickCover([])).toBeNull();
  });
});

describe('coverAlternatives', () => {
  it('oferece tudo menos a escolhida, na ordem de preferência', () => {
    const imagens = [
      imagem('x/logo.png'),
      imagem('x/library_hero.jpg'),
      imagem('x/library_hero_blur.jpg'),
    ];
    const escolhida = pickCover(imagens);
    const alternativas = coverAlternatives(imagens, escolhida);
    expect(alternativas.map((image) => image.role)).toEqual(['hero', 'blur']);
  });

  it('sem escolhida não há alternativas', () => {
    expect(coverAlternatives([imagem('x/logo.png')], null)).toHaveLength(0);
  });
});