import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Button, useInterface } from '@nexora/ui';
import { useLibrary } from '../state/desktop.js';
import { GameShelf } from '../components/GameShelf.js';
import { formatPlayTime } from '../lib/format.js';
import { coverUrl } from '../lib/media.js';

/**
 * Modo grande ecrã — o launcher a dez pés.
 *
 * A mesma biblioteca, desenhada para o sofá: ecrã inteiro, tipografia e
 * cápsulas maiores, e **navegação por teclado** — as setas movem a selecção
 * entre as cápsulas, o Enter abre, o Escape volta ao launcher. (O comando de
 * um jogo não é aqui emulado: nada é anunciado antes de existir.)
 *
 * Os dados são os de sempre: as prateleiras mostram o que é real — quem
 * joga, o que acabou, e o que ainda não experimentaste. Uma prateleira sem
 * jogos não existe.
 */
export function BigPicturePage({
  onExit,
  onOpenGame,
}: {
  readonly onExit: () => void;
  readonly onOpenGame: (gameId: string) => void;
}): ReactNode {
  const { t, locale } = useInterface();
  const library = useLibrary();
  const root = useRef<HTMLDivElement>(null);

  const games = library.value ?? [];

  const rows = useMemo(
    () => ({
      hot: [...games].sort((left, right) => right.totalSeconds - left.totalSeconds),
      recent: [...games]
        .filter((game) => game.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? '').localeCompare(left.lastPlayedAt ?? '')),
      discover: games.filter((game) => game.totalSeconds === 0),
    }),
    [games],
  );

  const featured = useMemo(
    () =>
      [...games]
        .filter((game) => game.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? '').localeCompare(left.lastPlayedAt ?? ''))[0] ??
      [...games].sort((left, right) => right.totalSeconds - left.totalSeconds)[0] ??
      null,
    [games],
  );

  /** Os cartões em ordem de leitura (as prateleiras, da esquerda para a direita). */
  const cards = useCallback((): readonly HTMLButtonElement[] => {
    const node = root.current;
    if (node === null) {
      return [];
    }
    return [...node.querySelectorAll<HTMLButtonElement>('.hub-capsule__art')];
  }, []);

  /** Move o foco entre cartões (o Enter abre o que está focado). */
  const move = useCallback(
    (delta: number) => {
      const items = cards();
      if (items.length === 0) {
        return;
      }
      const current = items.findIndex((item) => item === document.activeElement);
      const next = (current === -1 ? 0 : current + delta + items.length) % items.length;
      items[next]?.focus();
    },
    [cards],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight') {
        move(1);
      } else if (event.key === 'ArrowLeft') {
        move(-1);
      } else if (event.key === 'Escape') {
        onExit();
      }
      // O Enter e o espaço já activam o botão focado: nada a fazer.
    },
    [move, onExit],
  );

  // A seleção começa no primeiro cartão — o modo sofa não pede rato para
  // começar a navegar.
  useEffect(() => {
    cards()[0]?.focus();
  }, [cards, games.length]);

  if (library.loading) {
    return <p className="hub-big__loading">{t('common.loading')}</p>;
  }

  return (
    <div
      className="hub-big"
      ref={root}
      role="application"
      aria-label={t('bigpicture.title')}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header className="hub-big__bar">
        <span className="hub-big__clock">{new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date())}</span>
        <span style={{ flex: 1 }} />
        <Button onClick={onExit}>{t('bigpicture.exit')}</Button>
      </header>

      {featured !== null ? (
        <section
          className="hub-big__hero"
          style={coverUrl(featured.cover) === null ? undefined : { backgroundImage: `url("${coverUrl(featured.cover)}")` }}
        >
          <span className="hub-big__heroLabel">{t('home.featured')}</span>
          <strong className="hub-big__heroTitle">{featured.title}</strong>
          <div className="hub-row">
            <Button variant="primary" onClick={() => onOpenGame(featured.externalKey)}>
              {t('details.title')}
            </Button>
          </div>
        </section>
      ) : null}

      <div className="hub-big__shelves">
        <GameShelf
          title={t('home.tab.hot')}
          games={rows.hot}
          size="lg"
          hoursLabelOf={(game) => (game.totalSeconds >= 3600 ? formatPlayTime(game.totalSeconds, locale, t) : null)}
          playLabel={t('common.action.play')}
          onSelect={onOpenGame}
          onPlay={onOpenGame}
        />
        <GameShelf
          title={t('home.tab.recent')}
          games={rows.recent}
          size="lg"
          hoursLabelOf={(game) => (game.totalSeconds >= 3600 ? formatPlayTime(game.totalSeconds, locale, t) : null)}
          playLabel={t('common.action.play')}
          onSelect={onOpenGame}
          onPlay={onOpenGame}
        />
        <GameShelf
          title={t('home.tab.discover')}
          games={rows.discover}
          size="lg"
          hoursLabelOf={(game) => (game.totalSeconds >= 3600 ? formatPlayTime(game.totalSeconds, locale, t) : null)}
          playLabel={t('common.action.play')}
          onSelect={onOpenGame}
          onPlay={onOpenGame}
        />
      </div>

      <p className="hub-big__hint">{t('bigpicture.hint')}</p>
    </div>
  );
}