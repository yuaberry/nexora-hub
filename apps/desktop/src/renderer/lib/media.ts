/**
 * Endereços das imagens — do disco do utilizador para a interface.
 *
 * Uma capa guardada é um caminho do disco (o logo que a Steam guardou, ou o
 * ficheiro que o utilizador escolheu). A interface corre sob o esquema
 * interno `nexora://`, e a CSP só permite imagens do próprio esquema: por
 * isso o caminho é traduzido para `nexora://cover/<caminho>`, que o processo
 * principal serve a partir do disco.
 *
 * Um caminho que já é um endereço (dados, http, https) passa tal qual — a
 * loja mostra capas de URLs, e essas não são do disco.
 */

/** Esquema interno da aplicação. */
const APP_ORIGIN = 'nexora://app';

/**
 * O endereço de uma capa a partir do caminho guardado.
 *
 * `null` (sem caminho) devolve `null` — quem chama desenha o placeholder do
 * tema, nunca uma imagem inventada.
 *
 * O caminho é **codificado**: a barra inicial de `/home/...` tem de
 * sobreviver à junção com `/cover/` — sem codificação, o caminho passava a
 * relativo (`home/...`) e a imagem não era encontrada (a prova ao vivo
 * apanhou isto: `404 Imagem não encontrada`).
 */
export function coverUrl(path: string | null): string | null {
  if (path === null || path === '') {
    return null;
  }
  if (path.startsWith('data:') || path.startsWith('http:') || path.startsWith('https:') || path.startsWith('blob:')) {
    return path;
  }
  return `${APP_ORIGIN}/cover/${encodeURIComponent(path)}`;
}

/**
 * Como uma capa se deve encaixar na moldura.
 *
 * A Steam guarda dois tipos de arte, e os dois precisam de tratamentos
 * diferentes:
 *
 * - o **logo** e o **cabeçalho** são arte com margens (transparentes ou
 *   escuras) desenhada para flutuar sobre um fundo — forçá-la a encher a
 *   caixa corta o nome e desalinha a imagem (foi o que a prova ao vivo
 *   mostrou: o logo 640×360 numa moldura 3:4 saía cortado);
 * - o **herói** e a **cápsula** são arte de canto a canto — enchêm a
 *   moldura e o excedente é cortado, que é o que se quer.
 *
 * Uma capa escolhida pelo utilizador é um ficheiro desconhecido: encher a
 * moldura é o tratamento seguro (o nome do ficheiro não decide por ele).
 */
export function coverFit(path: string | null): 'cover' | 'contain' {
  if (path === null) {
    return 'cover';
  }
  const name = path.toLowerCase();
  return name.includes('logo') || name.includes('header') ? 'contain' : 'cover';
}
