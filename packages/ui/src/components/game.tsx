import type { ReactNode } from 'react';
import type { LibraryGame } from '@nexora/protocol';

/**
 * Cartão de jogo da biblioteca.
 *
 * A capa é o ficheiro local do utilizador; quando não há capa, o cartão
 * desenha o **placeholder do tema** com as iniciais do título. Nunca se
 * inventa uma capa: uma imagem errada é pior que nenhuma.
 */

export interface GameCardProps {
  readonly game: LibraryGame;
  /** Texto do tempo jogado (já formatado pelo idioma activo). */
  readonly playTimeLabel: string;
  /** Última vez jogado (`null` = nunca). */
  readonly lastPlayedLabel: string | null;
  readonly favorite: boolean;
  readonly onSelect: (gameId: string) => void;
  readonly onPlay?: (gameId: string) => void;
  /** Texto do botão "Jogar". */
  readonly playLabel: string;
  /** Texto de "Favorito" (para o leitor de ecrã). */
  readonly favoriteLabel: string;
}

/** Iniciais do título, para o placeholder (até três letras). */
export function initials(title: string): string {
  const words = title
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 3);
  if (words.length === 0) {
    return '?';
  }
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('');
}

export function GameCard({
  game,
  playTimeLabel,
  lastPlayedLabel,
  favorite,
  onSelect,
  onPlay,
  playLabel,
  favoriteLabel,
}: GameCardProps): ReactNode {
  return (
    <article className="nx-game-card" data-game-id={game.id}>
      <button
        type="button"
        className="nx-cover"
        aria-label={game.title}
        onClick={() => {
          onSelect(game.id);
        }}
      >
        {game.cover === null ? (
          <span aria-hidden="true">{initials(game.title)}</span>
        ) : (
          <img src={game.cover} alt="" loading="lazy" />
        )}
      </button>
      <div className="nx-stack">
        <strong>{game.title}</strong>
        <span className="nx-subtitle">{lastPlayedLabel ?? playTimeLabel}</span>
      </div>
      <div className="nx-row nx-row--between">
        {favorite ? <span className="nx-badge">{favoriteLabel}</span> : <span className="nx-subtitle">{playTimeLabel}</span>}
        {onPlay === undefined ? null : (
          <button
            type="button"
            className="nx-button nx-button--primary"
            onClick={() => {
              onPlay(game.id);
            }}
          >
            {playLabel}
          </button>
        )}
      </div>
    </article>
  );
}