/**
 * Preparação do prefixo Wine — o que o spawn não faz.
 *
 * O Wine faz `chdir` para a pasta do prefixo antes de arrancar e **morre com
 * código 1** se ela não existir (a prova real apanhou isto: o jogo
 * "arrancava" e morria em milissegundos, sem uma única mensagem de erro).
 * O `spawn` não cria directorias — quem arranca cria a pasta antes.
 */

import { mkdirSync } from 'node:fs';

/**
 * Cria a pasta do prefixo Wine de um jogo, com os pais.
 *
 * Idempotente: criar uma pasta que já existe não é erro, e o que é do
 * utilizador dentro do prefixo (a configuração dele) mantém-se.
 */
export function ensureWinePrefix(prefixPath: string): void {
  mkdirSync(prefixPath, { recursive: true });
}