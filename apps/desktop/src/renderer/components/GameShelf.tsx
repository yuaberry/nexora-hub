import type { ReactNode } from 'react';
import { GameCapsule } from './GameCapsule.js';
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
  onSelect,
  onPlay,
  onToggleFavorite,
}: {
  readonly title: string;
  readonly games: readonly DesktopGameView[];
  /** As horas de cada jogo (já formatadas), ou `null` sem tempo medido. */
  readonly hoursLabelOf: (game: DesktopGameView) => string | null;
  readonly playLabel: string;
  readonly onSelect: (gameId: string) => void;
  readonly onPlay: (gameId: string) => void;
  readonly onToggleFavorite?: (gameId: string) => void;
}): ReactNode {
  if (games.length === 0) {
    return null;
  }

  return (
    <section className="hub-shelf">
      <strong className="hub-shelf__title">{title}</strong>
      <div className="hub-shelf__row">
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