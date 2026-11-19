import { common } from './common.js';
import { library } from './library.js';
import { settings } from './settings.js';
import { planned } from './planned.js';
import { downloads } from './downloads.js';
import { saves } from './saves.js';
import { community } from './community.js';
import { shell } from './shell.js';
import { libraryExtra } from './library-extra.js';
import { pages } from './pages.js';

/**
 * Dicionário PT-BR — a fonte de verdade da forma.
 *
 * As chaves são **planas** e explícitas (`'library.search.placeholder'`),
 * nunca construídas por concatenação: só assim o tipo consegue verificá-las.
 * A tradução inglesa é derivada deste formato — uma chave em falta no EN é
 * erro de compilação.
 */
export const ptBR = {
  ...common,
  ...library,
  ...settings,
  ...planned,
  ...downloads,
  ...saves,
  ...community,
  ...shell,
  ...libraryExtra,
  ...pages,
} as const;