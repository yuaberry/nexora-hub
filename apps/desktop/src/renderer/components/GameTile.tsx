import type { ReactNode } from 'react';
import type { LibraryGame } from '@nexora/protocol';
import { coverUrl } from '../lib/media.js';

/**
 * Cartão de jogo da biblioteca — a peça central da grelha.
 *
 * A capa é o ficheiro local do utilizador; sem ficheiro, o placeholder do tema
 * com as iniciais (nunca uma imagem inventada). O botão de jogar aparece por
 * cima da capa ao pairar — e o foco pelo teclado mostra o mesmo (acessibilidade
 * não é só rato).
 */

/** Iniciais do título, para o placeholder (até três letras). */
export function initials(title: string): string {
  const words = title.split(/\s+/).filter((word) => word.length > 0).slice(0, 3);
  if (words.length === 0) {
    return '?';
  }
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('');
}

export interface GameTileProps {
  readonly game: LibraryGame;
  /** Texto do tempo jogado (já formatado no idioma activo). */
  readonly playTimeLabel: string;
  /** Texto da meta (última vez jogado, favorito…). */
  readonly metaLabel: string;
  readonly favorite: boolean;
  /** Texto do botão de jogar. */
  readonly playLabel: string;
  readonly onSelect: (gameId: string) => void;
  readonly onPlay: (gameId: string) => void;
  readonly onToggleFavorite?: (gameId: string) => void;
}

export function GameTile({
  game,
  playTimeLabel,
  metaLabel,
  favorite,
  playLabel,
  onSelect,
  onPlay,
  onToggleFavorite,
}: GameTileProps): ReactNode {
  return (
    <article className="hub-tile" data-game-id={game.id}>
      <button
        type="button"
        className="hub-tile__cover"
        aria-label={game.title}
        onClick={() => {
          onSelect(game.id);
        }}
      >
        {game.cover === null ? (
          <span aria-hidden="true">{initials(game.title)}</span>
        ) : (
          <img src={coverUrl(game.cover) ?? undefined} alt="" loading="lazy" />
        )}
        <span className="hub-tile__play" aria-hidden="true">
          ▶ {playLabel}
        </span>
      </button>

      <div className="hub-tile__body">
        <strong className="hub-tile__title">{game.title}</strong>
        <span className="hub-tile__meta">{metaLabel}</span>
        <span className="hub-tile__meta">{playTimeLabel}</span>
        {onToggleFavorite === undefined ? null : (
          <div className="hub-row">
            <button
              type="button"
              className="hub-icon-btn"
              aria-pressed={favorite}
              onClick={() => {
                onToggleFavorite(game.id);
              }}
            >
              {favorite ? '★' : '☆'}
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '0 0.75rem 0.75rem' }}>
        <button
          type="button"
          className="nx-button nx-button--primary nx-button--block"
          onClick={() => {
            onPlay(game.id);
          }}
        >
          {playLabel}
        </button>
      </div>
    </article>
  );
}