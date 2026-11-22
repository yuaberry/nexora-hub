/**
 * Overlay — a janela que fica por cima do jogo.
 *
 * A regra de honestidade aplica-se aqui também: o overlay mostra as
 * **medidas reais** (CPU, memória, temperatura — o que o sistema dá) e a
 * sessão em curso. O **FPS** não aparece com número: medir FPS exige injecção
 * no processo do jogo, e isso é fase futura. Os amigos e o chat ficam na
 * janela do launcher — exigem a sessão, que vive no renderer, e o overlay não
 * a guarda.
 *
 * A janela é transparente, sem moldura e sempre ao topo; fica escondida até o
 * atalho (Shift+Tab) a chamar, e o atalho só está registado enquanto há jogo
 * a correr — um atalho global capturado sem jogo seria um atalho roubado ao
 * sistema.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, globalShortcut, type BrowserWindow as BrowserWindowType } from 'electron';
import { TelemetryObserver, hottest } from './telemetry.js';

/** O que o overlay mostra. */
export interface OverlayData {
  readonly cpuPercent: number | null;
  readonly memoryPercent: number | null;
  readonly temperatureCelsius: number | null;
  readonly temperatureChip: string | null;
  /** Jogo em curso, ou `null`. */
  readonly gameTitle: string | null;
  /** Segundos desde o início da sessão. */
  readonly elapsedSeconds: number | null;
}

/** Intervalo entre empurrões de dados (a CPU mede-se por diferença). */
const PUSH_MS = 2_000;

/** O observador de telemetria partilhado (a mesma medida do cartão). */
const observer = new TelemetryObserver();

/** A janela do overlay (`null` quando não está aberta). */
let overlay: BrowserWindowType | null = null;

/** Quem está a correr agora (o runner informa a janela principal). */
let currentGame: { title: string; startedAt: string } | null = null;

/** Cria a janela do overlay (uma por aplicação). */
function ensureOverlay(): BrowserWindowType {
  if (overlay !== null && !overlay.isDestroyed()) {
    return overlay;
  }
  const window = new BrowserWindow({
    width: 620,
    height: 360,
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
  // A página do overlay é servida pelo mesmo esquema interno.
  window.loadURL('nexora://app/overlay.html');
  window.on('closed', () => {
    overlay = null;
  });
  overlay = window;
  return window;
}

/** Empurra os dados medidos para o overlay. */
function pushData(): void {
  if (overlay === null || overlay.isDestroyed() || !overlay.isVisible()) {
    return;
  }
  const sample = observer.sample();
  const temperature = hottest(sample);
  const elapsed =
    currentGame === null
      ? null
      : Math.max(0, Math.round((Date.now() - new Date(currentGame.startedAt).getTime()) / 1000));
  const data: OverlayData = {
    cpuPercent: sample.cpuPercent,
    memoryPercent: sample.memoryPercent,
    temperatureCelsius: temperature?.celsius ?? null,
    temperatureChip: temperature === null ? null : `${temperature.chip}${temperature.label === null ? '' : ` · ${temperature.label}`}`,
    gameTitle: currentGame?.title ?? null,
    elapsedSeconds: elapsed,
  };
  overlay.webContents.send('overlay:data', data);
}

/** O temporizador que empurra os dados enquanto o overlay está visível. */
let pushTimer: NodeJS.Timeout | null = null;

/** Abre (ou fecha) o overlay. */
export function toggleOverlay(): boolean {
  const window = ensureOverlay();
  if (window.isVisible()) {
    window.hide();
    if (pushTimer !== null) {
      clearInterval(pushTimer);
      pushTimer = null;
    }
    return false;
  }
  window.showInactive();
  pushData();
  pushTimer = setInterval(pushData, PUSH_MS);
  return true;
}

/**
 * Regista o atalho do overlay (Shift+Tab) enquanto há jogo a correr.
 *
 * Devolve `false` quando o atalho não pôde ser registado — outro programa da
 * máquina pode já tê-lo tomado, e fingir que ficou registado seria mentir.
 */
export function registerOverlayShortcut(): boolean {
  return globalShortcut.register('Shift+Tab', () => {
    toggleOverlay();
  });
}

/** Levanta o registo do atalho (quando o jogo acaba). */
export function unregisterOverlayShortcut(): void {
  globalShortcut.unregister('Shift+Tab');
}

/** Informa o overlay de qual jogo está a correr. */
export function setCurrentGame(game: { title: string; startedAt: string } | null): void {
  currentGame = game;
}

/** A raiz do renderer (a página do overlay é servida pelo esquema interno). */
export function overlayRendererRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'renderer')
    : join(dirname(fileURLToPath(import.meta.url)), '..', 'renderer');
}

/**
 * O caminho do preload, a partir da pasta **deste** módulo.
 *
 * `app.getAppPath()` devolve o directório de onde o Electron foi lançado em
 * desenvolvimento (a prova correu de `/tmp/elec-test` e o preload não foi
 * encontrado). O caminho seguro é o relativo ao ficheiro compilado:
 * `dist/main/overlay.js` → `dist/preload/index.cjs`.
 */
export function preloadPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'preload', 'index.cjs');
}

/** Reexportado para os testes. */
export { BrowserWindow };