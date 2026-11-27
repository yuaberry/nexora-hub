/**
 * Cosméticos — o que os pontos compram.
 *
 * A moeda é a mesma da economia: os pontos do livro (conquistas e tarefas).
 * Um cosmético só existe no catálogo **declarado** — comprar o que não está
 * no catálogo é impossível, e comprar duas vezes o mesmo também.
 *
 * O que um cosmético faz é limitado de propósito: um **selo** que aparece ao
 * lado do nome de quem joga. Não dá pontos, não dá vantagem e não muda
 * medidade nenhuma — é-decoração honesta, comprada com pontos reais.
 */

/** O tipo de cosmético (a lista cresce quando o comportamento existir). */
export type CosmeticKind = 'badge';

/** Um cosmético do catálogo. */
export interface Cosmetic {
  readonly id: string;
  /** Chave de tradução do nome (`cosmetic.<id>`). */
  readonly nameKey: string;
  /** Chave de tradução da descrição. */
  readonly descriptionKey: string;
  readonly kind: CosmeticKind;
  /** O custo em pontos — a moeda do livro, não um preco inventado. */
  readonly cost: number;
}

/**
 * O catálogo — a fonte da verdade dos cosméticos.
 *
 * Os custos são todos alcançáveis com pontos reais (conquistas + tarefas):
 * o primeiro selo custa menos do que a primeira conquista e uma tarefa dão
 * juntos, e nenhum custa mais do que a conta pode ganhar a jogar.
 */
export const COSMETICS: readonly Cosmetic[] = [
  {
    id: 'badge-owl',
    nameKey: 'cosmetic.badge.owl.name',
    descriptionKey: 'cosmetic.badge.owl.description',
    kind: 'badge',
    cost: 15,
  },
  {
    id: 'badge-marathon',
    nameKey: 'cosmetic.badge.marathon.name',
    descriptionKey: 'cosmetic.badge.marathon.description',
    kind: 'badge',
    cost: 40,
  },
  {
    id: 'badge-century',
    nameKey: 'cosmetic.badge.century.name',
    descriptionKey: 'cosmetic.badge.century.description',
    kind: 'badge',
    cost: 120,
  },
];

/** Um cosmético pelo identificador (`undefined` quando não existe). */
export function cosmeticById(id: string): Cosmetic | undefined {
  return COSMETICS.find((cosmetic) => cosmetic.id === id);
}

/** O custo de um cosmético (0 quando não existe — nunca um número inventado). */
export function cosmeticCost(id: string): number {
  return cosmeticById(id)?.cost ?? 0;
}

/** O que uma compra precisa saber para ser avaliada. */
export interface PurchaseInput {
  /** Os identificadores que o utilizador já tem. */
  readonly owned: readonly string[];
  /** O saldo do livro de pontos. */
  readonly balance: number;
  /** O cosmético pedido. */
  readonly cosmeticId: string;
}

/** O resultado de avaliar uma compra. */
export type PurchaseOutcome =
  | { readonly ok: true; readonly cosmetic: Cosmetic }
  | { readonly ok: false; readonly reason: 'unknown' | 'already-owned' | 'insufficient-funds' };

/**
 * Avalia uma compra **antes** de tocar no livro.
 *
 * A ordem dos motivos é deliberada: um cosmético que não existe não é
 * "caro", é desconhecido — e um cosmético que já é teu não gasta pontos duas
 * vezes, mesmo que o saldo chegue.
 */
export function evaluatePurchase(input: PurchaseInput): PurchaseOutcome {
  const cosmetic = cosmeticById(input.cosmeticId);
  if (cosmetic === undefined) {
    return { ok: false, reason: 'unknown' };
  }
  if (input.owned.includes(cosmetic.id)) {
    return { ok: false, reason: 'already-owned' };
  }
  if (input.balance < cosmetic.cost) {
    return { ok: false, reason: 'insufficient-funds' };
  }
  return { ok: true, cosmetic };
}

/** O que equipar precisa saber. */
export interface EquipInput {
  readonly owned: readonly string[];
  readonly cosmeticId: string;
}

/**
 * Avalia equipar: só o que é teu se equipa.
 *
 * Equipar o que não foi comprado seria mostrar um selo que ninguém pagou —
 * a recusa é explícita e a interface diz o motivo.
 */
export function equipOutcome(input: EquipInput): PurchaseOutcome {
  const cosmetic = cosmeticById(input.cosmeticId);
  if (cosmetic === undefined) {
    return { ok: false, reason: 'unknown' };
  }
  if (!input.owned.includes(cosmetic.id)) {
    return { ok: false, reason: 'already-owned' };
  }
  return { ok: true, cosmetic };
}

/** Quanto falta para um cosmético (0 quando já chega). */
export function missingPoints(balance: number, cosmeticId: string): number {
  const cost = cosmeticCost(cosmeticId);
  return cost <= balance ? 0 : cost - balance;
}