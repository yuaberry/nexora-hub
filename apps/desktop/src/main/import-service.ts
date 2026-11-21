/**
 * Importação de jogos locais — a parte que precisa do Electron.
 *
 * A NEXORA **não distribui** jogos: o launcher lê o que o utilizador já tem
 * no disco, detecta o executável e guarda a entrada. Nenhum caminho é
 * adivinhado — uma pasta sem executável plausível é recusada com motivo, e o
 * utilizador escolhe outra.
 *
 * A leitura de pastas e a importação vivem em `disk-scan.ts`, sem Electron:
 * são testáveis fora do runtime, e é de lá que a importação oficial as
 * importa. Aqui ficam o diálogo e a detecção de pastas comuns.
 */

import { dialog } from 'electron';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { prettyFolderName } from './naming.js';
import { localCoverFile, importFolder } from './disk-scan.js';
import type { LocalLibrary } from './db.js';
import type { DetectedFolderView, ImportResultView } from '../shared/preload-api.js';

// Reexportados para quem importa daqui (o contrato do IPC não muda).
export { importFolder, localCoverFile };

/** Abre o diálogo de escolha de pasta (`null` = cancelado). */
export async function pickFolder(parent?: import('electron').BrowserWindow): Promise<string | null> {
  const options: import('electron').OpenDialogOptions = {
    title: 'Escolher pasta do jogo',
    properties: ['openDirectory'],
  };
  const result = parent === undefined
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(parent, options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0] ?? null;
}

/** Escolhe uma pasta e importa (o caminho completo, com diálogo). */
export async function pickAndImport(
  library: LocalLibrary,
  parent?: import('electron').BrowserWindow,
): Promise<ImportResultView> {
  const chosen = await pickFolder(parent);
  if (chosen === null) {
    return { imported: [], skipped: [{ path: '', reasonKey: 'cancelled' }] };
  }
  return importFolder(library, chosen);
}

/**
 * Pastas comuns de jogos no sistema do utilizador.
 *
 * Só pastas do próprio utilizador são detectadas — e a detecção nunca copia,
 * nunca move e nunca adivinha o conteúdo: ela devolve candidatos para o
 * utilizador confirmar.
 */
export function detectCommonFolders(): readonly DetectedFolderView[] {
  const home = homedir();
  const candidates = [
    join(home, 'Games'),
    join(home, 'Jogos'),
    join(home, 'My Games'),
    join(home, '.steam', 'steam', 'steamapps', 'common'),
    join(home, '.local', 'share', 'Steam', 'steamapps', 'common'),
    join(home, 'Desktop'),
  ];

  return candidates
    .filter((path) => existsSync(path))
    .map((path) => ({ path, label: prettyFolderName(path) }));
}