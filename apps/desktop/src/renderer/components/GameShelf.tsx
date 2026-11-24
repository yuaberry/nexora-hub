import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GameCapsule } from './GameCapsule.js';
import { useInterface } from '@nexora/ui';
import type { DesktopGameView } from '../../shared/preload-api.js';

/**
 * Prateleira de jogos — uma linha horizontal de cápsulas.
 *
 * É o formato das montras das lojas: um título, e uma fila que se percorre de
 * lado. A fila é **scroll horizontal** (nunca quebra de linha): o olho lê uma
 * linha de cada vez, e a página inteira continua curta.
 *
 * Uma prateleira sem jogos **não existe** — quem chama decide se a mostra.
 * Nada de filas vazias a ocupar espaço.
 */
export function GameShelf({
  title,
  games,
  hoursLabelOf,
  playLabel,
  size = 'md',
  onSelect,
  onPlay,
  onToggleFavorite,
}: {
  readonly title: string;
  readonly games: readonly DesktopGameView[];
  /** `lg` no modo grande ecrã. */
  readonly size?: 'md' | 'lg';
  /** As horas de cada jogo (já formatadas), ou `null` sem tempo medido. */
  readonly hoursLabelOf: (game: DesktopGameView) => string | null;
  readonly playLabel: string;
  readonly onSelect: (gameId: string) => void;
  readonly onPlay: (gameId: string) => void;
  readonly onToggleFavorite?: (gameId: string) => void;
}): ReactNode {
  const { t } = useInterface();
  const row = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  /** Faz a fila andar quase uma página, e aprende onde estão as pontas. */
  const scrollBy = useCallback((direction: -1 | 1) => {
    const node = row.current;
    if (node === null) {
      return;
    }
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: 'smooth' });
  }, []);

  const onScroll = useCallback(() => {
    const node = row.current;
    if (node === null) {
      return;
    }
    setAtStart(node.scrollLeft <= 1);
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 1);
  }, []);

  // Uma fila que caiba inteira não tem para onde andar: as setas nascem
  // desactivadas (e voltam a medir-se quando os jogos mudam).
  useEffect(() => {
    onScroll();
  }, [onScroll, games.length]);

  if (games.length === 0) {
    return null;
  }

  return (
    <section className="hub-shelf">
      <div className="hub-row hub-row--between">
        <strong className="hub-shelf__title">{title}</strong>
        <span className="hub-row">
          <button
            type="button"
            className="hub-shelf__nav"
            aria-label={t('shelf.prev')}
            disabled={atStart}
            onClick={() => scrollBy(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="hub-shelf__nav"
            aria-label={t('shelf.next')}
            disabled={atEnd}
            onClick={() => scrollBy(1)}
          >
            ›
          </button>
        </span>
      </div>
      <div className="hub-shelf__row" ref={row} onScroll={onScroll}>
        {games.map((game) => (
          <div className="hub-shelf__item" key={game.externalKey}>
            <GameCapsule
              id={game.externalKey}
              title={game.title}
              cover={game.cover}
              installed={game.installed}
              hoursLabel={hoursLabelOf(game)}
              favorite={game.favorite}
              playLabel={playLabel}
              size={size}
              onSelect={onSelect}
              onPlay={onPlay}
              onToggleFavorite={onToggleFavorite}
            />
          </div>
        ))}
      </div>
    </section>
  );
}