import { common } from './common.js';
import { library } from './library.js';
import { settings } from './settings.js';
import { planned } from './planned.js';
import { downloads } from './downloads.js';
import { saves } from './saves.js';
import { community } from './community.js';
import { shell } from './shell.js';
import { libraryExtra } from './library-extra.js';
import { auth } from './auth.js';
import { store } from './store.js';
import { stats } from './stats.js';
import { family } from './family.js';
import { official } from './official.js';
import { steam } from './steam.js';
import { friends } from './friends.js';
import { perf } from './perf.js';
import { optimizer } from './optimizer.js';
import { chat } from './chat.js';
import { achievements } from './achievements.js';
import { benchmark } from './benchmark.js';
import { mods } from './mods.js';
import { recommend } from './recommend.js';
import { overlay } from './overlay.js';
import { steamSync } from './steam-sync.js';
import { catalog } from './catalog.js';
import { cloud } from './cloud.js';
import { forums } from './forums.js';
import { clans } from './clans.js';
import { events } from './events.js';
import { diagnostics } from './diagnostics.js';
import { syncedLibrary } from './synced-library.js';
import { pages } from './pages.js';

/**
 * Dicionário EN — formato **plano**, chaves explícitas.
 *
 * A paridade com o PT-BR é garantida pelo tipo `Dictionary` (ver
 * `../index.ts`): uma chave em falta aqui é erro de compilação.
 */
export const en = {
  ...common,
  ...library,
  ...settings,
  ...planned,
  ...downloads,
  ...saves,
  ...community,
  ...shell,
  ...libraryExtra,
  ...auth,
  ...store,
  ...stats,
  ...family,
  ...official,
  ...steam,
  ...friends,
  ...perf,
  ...optimizer,
  ...chat,
  ...achievements,
  ...benchmark,
  ...mods,
  ...recommend,
  ...overlay,
  ...steamSync,
  ...catalog,
  ...cloud,
  ...forums,
  ...clans,
  ...events,
  ...diagnostics,
  ...syncedLibrary,
  ...pages,
};