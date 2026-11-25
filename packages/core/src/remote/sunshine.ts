/**
 * Sunshine — o anfitrião de *streaming*, em regras puras.
 *
 * O Sunshine é o outro lado do Remote Play: em vez de ligar a um anfitrião
 * alheio, **esta** máquina torna-se o anfitrião — e outros aparelhos (ou o
 * Moonlight noutro PC) ligam-se a ela. O NEXORA HUB não faz *streaming*:
 * encaminha para o binário do sistema, que é quem sabe.
 *
 * O que vive aqui é o que se testa sem correr nada:
 *
 * - as **portas** documentadas do Sunshine (o que o Moonlight procura e o que
 *   a interface web usa);
 * - o **endereço** da interface web (para o utilizador emparelhar e configurar
 *   noutro aparelho);
 * - o que é um **endereço de rede local** (a interface web não se publica num
 *   endereço que não é da máquina).
 */

/** O binário do Sunshine (o que o sistema costuma ter). */
export const SUNSHINE_BINARIES: readonly string[] = ['sunshine'];

/** Porta da interface web do Sunshine (onde se emparelha e configura). */
export const SUNSHINE_WEB_PORT = 47990;

/** Portas que o Moonlight usa para falar com o Sunshine (documentadas). */
export const SUNSHINE_PORTS: readonly number[] = [47984, 47989, 47990];

/**
 * O endereço da interface web do Sunshine.
 *
 * `https://<ip>:47990` — o Sunshine usa HTTPS com certificado próprio, e é
 * aí que o utilizador introduz o PIN para emparelhar.
 */
export function sunshineWebUrl(lanAddress: string): string {
  return `https://${lanAddress.trim()}:${SUNSHINE_WEB_PORT}`;
}

/**
 * Um endereço é da rede local?
 *
 * Um IPv4 privado (as três gamas documentadas) — a interface web do Sunshine
 * vive na rede local, e publicá-la num endereço que não é da máquina seria
 * apontar para o sítio errado.
 */
export function isLanAddress(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const host = value.trim();
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (match === null) {
    return false;
  }
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) {
    return false;
  }
  const [first, second] = parts;
  if (first === undefined || second === undefined) {
    return false;
  }
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 e a gama de ligação local.
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}