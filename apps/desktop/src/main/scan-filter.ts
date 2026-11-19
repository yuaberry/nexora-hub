/**
 * Filtro do scan de disco — o que **não** é um jogo.
 *
 * A pasta `steamapps/common` do Steam guarda jogos, mas também as suas
 * próprias ferramentas: Proton, runtimes, redistributáveis e afins. Um scan
 * que importa tudo transforma a biblioteca numa lista de lixo — e o utilizador
 * perde a confiança na detecção.
 *
 * A lista é **declarada**, não mágica: nome exacto ou padrão conhecido, com o
 * motivo escrito. O que não estiver na lista entra (antes um jogo desconhecido
 * na biblioteca do que um jogo perdido).
 */

/** Nomes que nunca são jogos (comparação em minúsculas). */
const EXACT_NAMES: ReadonlySet<string> = new Set([
  'proton experimental',
  'proton 11 0',
  'proton 10 0',
  'proton 9 0',
  'proton 8 0',
  'proton 7 0',
  'proton 6 3',
  'proton 5 13',
  'steam linux runtime',
  'steam linux runtime 2 0',
  'steam linux runtime 3 0',
  'steam linux runtime 4 0',
  'steamworks shared',
  'steam controller configs',
  '_commonredist',
  'redist',
  'nvidia frameview',
]);

/**
 * Padrões que nunca são jogos (substring, em minúsculas).
 *
 * Deliberadamente curta: padrões genéricos como "directx" ou "vulkan"
 * excluiriam jogos com essas palavras no nome. A lista cobre só o que a
 * própria Steam guarda em `steamapps/common` além dos jogos — o custo de
 * encurtar a lista é um nome de ferramenta na biblioteca; o custo de alongar
 * é um jogo perdido.
 */
const PATTERNS: readonly string[] = [
  'proton',
  'steam linux runtime',
  'steamlinuxruntime',
  'steam runtime',
  'steamworks',
  'commonredist',
  'nvidia frameview',
  'amd amf',
];

/**
 * `true` quando o nome de uma pasta é uma ferramenta conhecida (não jogo).
 *
 * Função pura: a mesma entrada dá sempre a mesma resposta, e o teste fixa a
 * lista — uma entrada nova na lista entra com o seu teste.
 */
export function isKnownToolFolder(folderName: string): boolean {
  const normalized = folderName.trim().toLowerCase();
  if (EXACT_NAMES.has(normalized)) {
    return true;
  }
  return PATTERNS.some((pattern) => normalized.includes(pattern));
}