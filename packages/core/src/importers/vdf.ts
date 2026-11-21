/**
 * Parser de VDF (Valve KeyValues) — o formato dos ficheiros da Steam.
 *
 * A forma é a dos ficheiros reais (`libraryfolders.vdf`, `appmanifest_*.acf`):
 * pares de chave e valor entre aspas, blocos entre chavetas, tabulação como
 * separador e comentários `//`. O parser é **puro** e não adivinha: o que não
 * entendê, recusa com o motivo — melhor uma importação que falha às claras
 * do que uma biblioteca com títulos inventados.
 */

/** Um nó do VDF: objecto (mapa ordenado por inserção) ou valor de texto. */
export type VdfNode = ReadonlyMap<string, VdfValue>;

/** Um valor do VDF. */
export type VdfValue = string | VdfNode;

/** Erro de leitura — carrega a posição, para o diagnóstico ser útil. */
export class VdfParseError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} (posição ${position})`);
    this.name = 'VdfParseError';
    this.position = position;
  }
}

/**
 * Lê um texto VDF e devolve o nó de topo.
 *
 * Um ficheiro vazio devolve um mapa vazio — não há nada a entender, e isso
 * não é um erro.
 */
export function parseVdf(text: string): VdfNode {
  const parser = new VdfParser(text);
  return parser.parseDocument();
}

/** Lê um valor como texto (`null` quando não é texto). */
export function vdfString(value: VdfValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

/** Lê um valor como objecto (`null` quando não é objecto). */
export function vdfObject(value: VdfValue | undefined): VdfNode | null {
  return typeof value === 'object' && value instanceof Map ? value : null;
}

/** O leitor, caractere a caractere. */
class VdfParser {
  private index = 0;

  constructor(private readonly text: string) {}

  /** Documento inteiro: pares até ao fim. */
  parseDocument(): VdfNode {
    const node = this.parseObjectBody();
    this.skipWhitespaceAndComments();
    if (this.index < this.text.length) {
      throw new VdfParseError('conteúdo inesperado depois do documento', this.index);
    }
    return node;
  }

  /** Corpo de um objecto (sem as chavetas exteriores). */
  private parseObjectBody(): Map<string, VdfValue> {
    const result = new Map<string, VdfValue>();
    for (;;) {
      this.skipWhitespaceAndComments();
      if (this.index >= this.text.length || this.peek() === '}') {
        return result;
      }
      const key = this.parseQuoted();
      this.skipWhitespaceAndComments();
      // O separador real é tabulação ou espaços — já saltados. O que vem a
      // seguir é o valor: bloco ou texto.
      if (this.peek() === '{') {
        this.index += 1;
        result.set(key, this.parseObjectBody());
        this.expect('}');
        continue;
      }
      result.set(key, this.parseQuoted());
    }
  }

  /** Lê uma cadeia entre aspas, com `\"` escapado. */
  private parseQuoted(): string {
    if (this.peek() !== '"') {
      throw new VdfParseError('aspas de abertura em falta', this.index);
    }
    this.index += 1;
    let value = '';
    while (this.index < this.text.length) {
      const char = this.text[this.index]!;
      if (char === '\\' && this.text[this.index + 1] === '"') {
        value += '"';
        this.index += 2;
        continue;
      }
      if (char === '"') {
        this.index += 1;
        return value;
      }
      value += char;
      this.index += 1;
    }
    throw new VdfParseError('aspas de fecho em falta', this.index);
  }

  /** Salta espaços, tabulações, mudanças de linha e comentários `//`. */
  private skipWhitespaceAndComments(): void {
    while (this.index < this.text.length) {
      const char = this.text[this.index]!;
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        this.index += 1;
        continue;
      }
      if (char === '/' && this.text[this.index + 1] === '/') {
        while (this.index < this.text.length && this.text[this.index] !== '\n') {
          this.index += 1;
        }
        continue;
      }
      return;
    }
  }

  /** Caracter actual (nunca além do fim). */
  private peek(): string {
    return this.text[this.index] ?? '';
  }

  /** Consome um caracter esperado. */
  private expect(char: string): void {
    this.skipWhitespaceAndComments();
    if (this.peek() !== char) {
      throw new VdfParseError(`'${char}' esperado`, this.index);
    }
    this.index += 1;
  }
}