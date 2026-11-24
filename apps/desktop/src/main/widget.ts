/**
 * Widget de sessão — o Hudson que flutua sobre o jogo.
 *
 * Uma janela pequena, sem moldura e sempre ao topo, que responde a uma
 * pergunta sem tirar o jogo do ecrã: **que estou a jogar e há quanto tempo?**
 * O tempo é o da sessão real (o runner mede), e o botão de parar é o mesmo
 * que o launcher tem — o widget não inventa um controlo que não existe.
 *
 * A janela fecha-se quando não há sessão: um HUD sem jogo é um adesivo
 * colado ao ecrã.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, type BrowserWindow as BrowserWindowType } from 'electron';
import { formatClock } from '@nexora/core';

/** O que o widget mostra. */
export interface WidgetData {
  /** Jogo em curso, ou `null` (sem sessão). */
  readonly gameTitle: string | null;
  /** O relógio da sessão já formatado (`null` sem sessão). */
  readonly clock: string | null;
}

/** Intervalo entre empurrões (um segundo — o relógio é de segundos). */
const PUSH_MS = 1_000;

/** A janela do widget (`null` quando não está aberta). */
let widget: BrowserWindowType | null = null;

/** O temporizador que empurra o relógio. */
let pushTimer: NodeJS.Timeout | null = null;

/** A sessão em curso (o runner informa pelo `setWidgetSession`). */
let currentGame: { title: string; startedAt: string } | null = null;

/** O caminho do preload (o mesmo do overlay e do resto da app). */
function preloadPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'preload', 'index.cjs');
}

/** Cria a janela do widget (uma por aplicação). */
function ensureWidget(): BrowserWindowType {
  if (widget !== null && !widget.isDestroyed()) {
    return widget;
  }
  const window = new BrowserWindow({
    width: 240,
    height: 132,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      sandbox: true,
      contextIsolation: true,
    },
  });
  window.loadURL('nexora://app/widget.html');
  window.on('closed', () => {
    widget = null;
  });
  widget = window;
  return window;
}

/** Os dados do momento (o relógio é calculado a cada empurrão). */
function dataNow(): WidgetData {
  if (currentGame === null) {
    return { gameTitle: null, clock: null };
  }
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(currentGame.startedAt).getTime()) / 1000));
  return { gameTitle: currentGame.title, clock: formatClock(elapsed) };
}

/** Empurra os dados para o widget. */
function pushData(): void {
  if (widget === null || widget.isDestroyed() || !widget.isVisible()) {
    return;
  }
  widget.webContents.send('widget:data', dataNow());
}

/** Abre (ou fecha) o widget. */
export function toggleWidget(): boolean {
  const window = ensureWidget();
  if (window.isVisible()) {
    window.hide();
    if (pushTimer !== null) {
      clearInterval(pushTimer);
      pushTimer = null;
    }
    return false;
  }
  window.show();
  if (pushTimer === null) {
    pushTimer = setInterval(pushData, PUSH_MS);
  }
  pushData();
  return true;
}

/** O widget está visível? */
export function widgetVisible(): boolean {
  return widget !== null && !widget.isDestroyed() && widget.isVisible();
}

/**
 * Informa o widget da sessão em curso.
 *
 * Sem sessão, o widget fecha-se: um HUD sem jogo não tem o que dizer.
 */
export function setWidgetSession(session: { title: string; startedAt: string } | null): void {
  currentGame = session;
  if (session === null && widgetVisible()) {
    toggleWidget();
  }
}