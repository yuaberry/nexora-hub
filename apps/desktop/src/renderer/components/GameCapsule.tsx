import type { ReactNode } from 'react';
import { coverFit, coverUrl } from '../lib/media.js';
import { GameImage } from './GameImage.js';

/**
 * Cápsula de jogo — a parede da biblioteca.
 *
 * O formato é o das lojas modernas: uma cápsula **vertical** (2×3), o título
 * por baixo e as horas jogadas por cima do canto — a mesma arte em qualquer
 * máquina, porque a capa é a cápsula pública da Steam guardada em cache (ver
 * `covers-hydrate.ts`), não um ficheiro que só existe num computador.
 *
 * O botão de jogar aparece por cima da capa ao pairar (e pelo teclado, porque
 * acessibilidade não é só rato). Uma entrada de catálogo — metadado sem disco
 * — não arranca: o botão fica desactivado e a página do jogo explica o caminho
 * (o link da loja).
 */
export function GameCapsule({
  id,
  title,
  cover,
  installed = true,
  playLabel,
  hoursLabel,
  onSelect,
  onPlay,
  onToggleFavorite,
  favorite = false,
}: {
  readonly id: string;
  readonly title: string;
  readonly cover: string | null;
  /** `false` numa entrada de catálogo: não há executável. */
  readonly installed?: boolean;
  readonly playLabel: string;
  /** As horas já formatadas no idioma activo. */
  readonly hoursLabel: string | null;
  readonly onSelect: (id: string) => void;
  readonly onPlay: (id: string) => void;
  readonly onToggleFavorite?: (id: string) => void;
  readonly favorite?: boolean;
}): ReactNode {
  const url = coverUrl(cover);

  return (
    <article className="hub-capsule" data-game-id={id}>
      <button
        type="button"
        className="hub-capsule__art"
        aria-label={title}
        onClick={() => {
          onSelect(id);
        }}
      >
        <GameImage
          src={url}
          fit={coverFit(cover)}
          alt=""
          fallback={<span aria-hidden="true">{title.slice(0, 1).toUpperCase()}</span>}
        />
        {hoursLabel === null ? null : (
          <span className="hub-capsule__hours">
            <span aria-hidden="true">⏱</span> {hoursLabel}
          </span>
        )}
        <span className="hub-capsule__play" aria-hidden="true">
          ▶ {playLabel}
        </span>
      </button>

      <div className="hub-capsule__body">
        <strong className="hub-capsule__title" title={title}>
          {title}
        </strong>
        <div className="hub-row hub-row--between">
          <button
            type="button"
            className="nx-button nx-button--primary"
            disabled={!installed}
            onClick={() => {
              onPlay(id);
            }}
          >
            {playLabel}
          </button>
          {onToggleFavorite === undefined ? null : (
            <button
              type="button"
              className="hub-icon-btn"
              aria-pressed={favorite}
              aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              onClick={() => {
                onToggleFavorite(id);
              }}
            >
              {favorite ? '★' : '☆'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}