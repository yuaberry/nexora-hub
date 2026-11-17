import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, Select, TextInput, Toggle } from '../src/components/controls.js';
import { Badge, EmptyState, PlannedBadge, PlannedNotice, StorageBarView } from '../src/components/display.js';
import { GameCard, initials } from '../src/components/game.js';
import { Sidebar, ThemeSwitch } from '../src/components/layout.js';
import type { LibraryGame } from '@nexora/protocol';

const game: LibraryGame = {
  id: 'minecraft',
  title: 'Minecraft',
  cover: null,
  provider: 'local',
  tags: ['sandbox'],
  adult: false,
  installPath: '/jogos/minecraft',
  executablePath: '/jogos/minecraft/minecraft',
  favorite: true,
  collections: [],
  lastPlayedAt: null,
  totalSeconds: 3600,
};

describe('controlos', () => {
  it('o botão primário leva a classe do token de acento', () => {
    const html = renderToStaticMarkup(<Button variant="primary">Jogar</Button>);
    expect(html).toContain('nx-button--primary');
    expect(html).toContain('>Jogar</button>');
  });

  it('o botão desactivado não é clicável', () => {
    const html = renderToStaticMarkup(<Button disabled>Jogar</Button>);
    expect(html).toContain('disabled');
  });

  it('o campo de texto liga o rótulo ao input', () => {
    const html = renderToStaticMarkup(<TextInput label="E-mail" id="email" />);
    expect(html).toContain('for="email"');
    expect(html).toContain('id="email"');
  });

  it('o select tem min-width zero (evita scroll horizontal)', () => {
    const html = renderToStaticMarkup(
      <Select label="Idioma" id="locale" options={[{ value: 'pt-BR', label: 'Português' }]} />,
    );
    expect(html).toContain('class="nx-select"');
  });

  it('o interruptor expõe role=switch e estado', () => {
    const html = renderToStaticMarkup(
      <Toggle label="Reduzir movimento" checked={false} onChange={() => {}} />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
  });
});

describe('exibição', () => {
  it('o selo planeado tem o tom de aviso', () => {
    expect(renderToStaticMarkup(<PlannedBadge label="Planeado" />)).toContain('nx-badge--planned');
  });

  it('o badge neutro não finge estado', () => {
    const html = renderToStaticMarkup(<Badge>Local</Badge>);
    expect(html).toContain('nx-badge--neutral');
    expect(html).not.toContain('nx-badge--planned');
    expect(html).not.toContain('nx-badge--positive');
  });

  it('o estado vazio explica o que fazer', () => {
    const html = renderToStaticMarkup(<EmptyState title="Vazia" hint="Importe uma pasta" />);
    expect(html).toContain('Importe uma pasta');
  });

  it('o aviso de planeado mostra o selo e o motivo', () => {
    const html = renderToStaticMarkup(
      <PlannedNotice badge="Planeado" title="Loja" hint="Ainda não existe." />,
    );
    expect(html).toContain('nx-banner');
    expect(html).toContain('Ainda não existe.');
  });

  it('a barra de armazenamento desenha três segmentos com tons distintos', () => {
    const html = renderToStaticMarkup(
      <StorageBarView label="Armazenamento" used={40} other={30} total={100} />,
    );
    expect(html).toContain('nx-storage-bar__segment--accent');
    expect(html).toContain('nx-storage-bar__segment--neutral');
    expect(html).toContain('nx-storage-bar__segment--warning');
    expect(html).toContain('data-segment="games"');
    expect(html).toContain('data-segment="free"');
  });
});

describe('cartão de jogo', () => {
  it('sem capa mostra as iniciais (placeholder do tema)', () => {
    const html = renderToStaticMarkup(
      <GameCard
        game={game}
        playTimeLabel="1 h"
        lastPlayedLabel={null}
        favorite
        favoriteLabel="Favorito"
        playLabel="Jogar"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('>M</span>');
    expect(html).toContain('data-game-id="minecraft"');
  });

  it('com capa local mostra a imagem', () => {
    const html = renderToStaticMarkup(
      <GameCard
        game={{ ...game, cover: '/jogos/minecraft/capa.png' }}
        playTimeLabel="1 h"
        lastPlayedLabel={null}
        favorite={false}
        favoriteLabel="Favorito"
        playLabel="Jogar"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('src="/jogos/minecraft/capa.png"');
  });

  it('as iniciais respeitam três palavras', () => {
    expect(initials('League of Legends')).toBe('LOL');
    expect(initials('Minecraft')).toBe('M');
    expect(initials('   ')).toBe('?');
  });
});

describe('estrutura', () => {
  it('a barra lateral marca o item activo', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        title="NEXORA HUB"
        plannedLabel="Planeado"
        activeId="library"
        items={[
          { id: 'library', label: 'Biblioteca' },
          { id: 'store', label: 'Loja', planned: true },
        ]}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Planeado');
  });

  it('o alternador de tema anima e informa o estado', () => {
    const html = renderToStaticMarkup(
      <ThemeSwitch
        theme="dark"
        onToggle={() => {}}
        label="Alternador de tema"
        lightLabel="Claro"
        darkLabel="Escuro"
      />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('nx-theme-switch__thumb');
  });
});