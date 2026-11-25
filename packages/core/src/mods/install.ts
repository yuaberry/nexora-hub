/**
 * Instalação de modos — o plano antes de copiar.
 *
 * Instalar um modo é copiar um `.jar` para a pasta de modos do jogo. Parece
 * simples, e é — mas as decisões chatas são as que fazem um modo desaparecer:
 *
 * - só entra um ficheiro com nome de modo (`.jar` ou `.jar.disabled`);
 * - um nome que já existe **não** é substituído em silêncio — a decisão é de
 *   quem instala (mover à mão é explícito, sobrescrever às escondidas não);
 * - o tamanho tem limite declarado — um ficheiro enorme não enche o disco sem
 *   aviso.
 *
 * Tudo aqui é puro: o plano é testado sem tocar no disco.
 */

/** O maior ficheiro de modo aceite (256 MB). */
export const MAX_MOD_BYTES = 256 * 1024 * 1024;

/** As extensões que a pasta de mods aceita. */
const MOD_EXTENSIONS = ['.jar', '.jar.disabled'] as const;

/** Um pedido de instalação. */
export interface InstallRequest {
  /** O nome do ficheiro escolhido. */
  readonly fileName: string;
  readonly sizeBytes: number;
  /** Os nomes que já estão na pasta de destino. */
  readonly existing: readonly string[];
  /** A pasta de mods do jogo (`null` quando não foi encontrada). */
  readonly targetFolder: string | null;
}

/** O resultado do plano. */
export type InstallPlan =
  | { readonly ok: true; readonly fileName: string }
  | { readonly ok: false; readonly reason: 'not-a-mod' | 'too-large' | 'already-exists' | 'no-folder' };

/**
 * O plano de instalação de um modo.
 *
 * A ordem das recusas é deliberada: primeiro o que o ficheiro **é** (nome e
 * tamanho), depois onde vai entrar (pasta e conflito). Um ficheiro que não é
 * modo não chega a olhar para a pasta.
 */
export function planModInstall(request: InstallRequest): InstallPlan {
  if (request.targetFolder === null) {
    return { ok: false, reason: 'no-folder' };
  }
  const name = request.fileName.trim();
  if (!MOD_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))) {
    return { ok: false, reason: 'not-a-mod' };
  }
  if (request.sizeBytes > MAX_MOD_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  // O conflito é pelo nome, sem distinguir maiúsculas: dois modos com o mesmo
  // nome em discos diferentes são o mesmo nome na mesma pasta.
  const normalized = name.toLowerCase();
  if (request.existing.some((entry) => entry.toLowerCase() === normalized)) {
    return { ok: false, reason: 'already-exists' };
  }
  return { ok: true, fileName: name };
}