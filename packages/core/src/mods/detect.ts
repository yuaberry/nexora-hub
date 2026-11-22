/**
 * Detector de modos — o que há na pasta `mods` de um jogo.
 *
 * A detecção é **explicável**: cada *.jar* declara o seu carregador
 * (*loader*) por um ficheiro dentro do arquivo — `fabric.mod.json`,
 * `quilt.mod.json`, `META-INF/mods.toml` (Forge) ou
 * `META-INF/neoforge.mods.toml`. Nada é adivinhado por nome de ficheiro: um
 * jar sem nenhum marcador é **desconhecido**, e o total diz quantos eram.
 */

/** Carregadores de modos conhecidos. */
export type ModLoader = 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'unknown';

/** Um modo detectado. */
export interface DetectedMod {
  /** Nome do ficheiro (`sodium-0.6.0.jar`). */
  readonly fileName: string;
  /** Tamanho em bytes. */
  readonly sizeBytes: number;
  /** Carregador declarado pelo arquivo. */
  readonly loader: ModLoader;
  /** Nome legível, quando o manifesto o declara. */
  readonly displayName: string | null;
  /** Versão, quando o manifesto a declara. */
  readonly version: string | null;
}

/** O que a detecção precisa de cada *.jar*. */
export interface ModArchive {
  readonly fileName: string;
  readonly sizeBytes: number;
  /** Nomes das entradas dentro do arquivo (a lista do `unzip -l`). */
  readonly entries: readonly string[];
  /** Conteúdo do manifesto, quando foi lido (para o nome e a versão). */
  readonly manifestText?: string | null;
}

/** Os marcadores que declaram cada carregador. */
const LOADER_MARKERS: readonly { readonly loader: ModLoader; readonly entry: string }[] = [
  { loader: 'fabric', entry: 'fabric.mod.json' },
  { loader: 'quilt', entry: 'quilt.mod.json' },
  { loader: 'neoforge', entry: 'META-INF/neoforge.mods.toml' },
  { loader: 'forge', entry: 'META-INF/mods.toml' },
];

/**
 * O carregador de um arquivo, pelos marcadores que ele tem.
 *
 * A ordem dos marcadores importa: um pacote NeoForge também contém o
 * `mods.toml` do Forge, por isso o NeoForge é testado primeiro.
 */
export function loaderOf(archive: ModArchive): ModLoader {
  const names = new Set(archive.entries);
  for (const marker of LOADER_MARKERS) {
    if (names.has(marker.entry)) {
      return marker.loader;
    }
  }
  return 'unknown';
}

/**
 * Detecta os modos de uma pasta.
 *
 * Os arquivos sem marcador ficam com `loader: 'unknown'` e contam no total —
 * um total que escondesse os desconhecidos seria uma mentira com cara de
 * número.
 */
export function detectMods(archives: readonly ModArchive[]): readonly DetectedMod[] {
  return archives.map((archive) => {
    const loader = loaderOf(archive);
    const manifest = readManifest(archive);
    return {
      fileName: archive.fileName,
      sizeBytes: archive.sizeBytes,
      loader,
      displayName: manifest?.name ?? null,
      version: manifest?.version ?? null,
    };
  });
}

/** O resumo de uma pasta de modos. */
export interface ModSummary {
  readonly total: number;
  /** Quantidade por carregador (o mapa só tem os que existem). */
  readonly byLoader: ReadonlyMap<ModLoader, number>;
  /** Quantidade de arquivos sem marcador conhecido. */
  readonly unknown: number;
  /** Bytes somados dos arquivos. */
  readonly totalBytes: number;
}

/** Resume uma lista de modos detectados. */
export function summarizeMods(mods: readonly DetectedMod[]): ModSummary {
  const byLoader = new Map<ModLoader, number>();
  let unknown = 0;
  let totalBytes = 0;
  for (const mod of mods) {
    byLoader.set(mod.loader, (byLoader.get(mod.loader) ?? 0) + 1);
    if (mod.loader === 'unknown') {
      unknown += 1;
    }
    totalBytes += mod.sizeBytes;
  }
  return { total: mods.length, byLoader, unknown, totalBytes };
}

/** O rótulo legível de um carregador (chave de tradução). */
export function loaderLabelKey(loader: ModLoader): 'mods.loader.fabric' | 'mods.loader.quilt' | 'mods.loader.forge' | 'mods.loader.neoforge' | 'mods.loader.unknown' {
  switch (loader) {
    case 'fabric':
      return 'mods.loader.fabric';
    case 'quilt':
      return 'mods.loader.quilt';
    case 'forge':
      return 'mods.loader.forge';
    case 'neoforge':
      return 'mods.loader.neoforge';
    default:
      return 'mods.loader.unknown';
  }
}

/**
 * O nome e a versão do manifesto, quando ele foi lido.
 *
 * O Fabric e o Quilt usam JSON (`{"id":…,"version":…,"name":…}`); o Forge e o
 * NeoForge usam TOML com uma tabela `[[mods]]`. Um manifesto que não se
 * entende devolve `null` — o modo continua detectado, só sem nome.
 */
function readManifest(archive: ModArchive): { name: string | null; version: string | null } | null {
  const text = archive.manifestText ?? null;
  if (text === null || text.trim() === '') {
    return null;
  }
  if (text.trimStart().startsWith('{')) {
    return readJsonManifest(text);
  }
  return readTomlManifest(text);
}

/** Manifesto JSON (Fabric/Quilt). */
function readJsonManifest(text: string): { name: string | null; version: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'] : typeof record['id'] === 'string' ? record['id'] : null;
  const version = typeof record['version'] === 'string' ? record['version'] : null;
  return { name, version };
}

/** Manifesto TOML (Forge/NeoForge) — só o que interessa, sem um parser TOML inteiro. */
function readTomlManifest(text: string): { name: string | null; version: string | null } | null {
  const name = firstTomlValue(text, ['displayName', 'display_name']);
  const version = firstTomlValue(text, ['version']);
  if (name === null && version === null) {
    return null;
  }
  return { name, version };
}

/** O primeiro valor de uma chave TOML, entre as candidatas. */
function firstTomlValue(text: string, keys: readonly string[]): string | null {
  for (const key of keys) {
    const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']*)["']`, 'm'));
    if (match !== null) {
      return match[1] ?? null;
    }
  }
  return null;
}