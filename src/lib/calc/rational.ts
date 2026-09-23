/**
 * Exact rational arithmetic on bigint for money. Amounts never pass through
 * binary floating point; they are rounded to cents exactly once, at the point a
 * value is reported.
 */
export class Rational {
  readonly num: bigint;
  readonly den: bigint;

  private constructor(num: bigint, den: bigint) {
    if (den === 0n) throw new RangeError("zero denominator");
    const sign = den < 0n ? -1n : 1n;
    const g = gcd(abs(num), abs(den)) || 1n;
    this.num = (sign * num) / g;
    this.den = (sign * den) / g;
  }

  static of(num: bigint | number, den: bigint | number = 1): Rational {
    const toBig = (v: bigint | number) => {
      if (typeof v === "number" && !Number.isSafeInteger(v)) throw new RangeError(`not a safe integer: ${v}`);
      return BigInt(v);
    };
    return new Rational(toBig(num), toBig(den));
  }

  /** Parses a plain decimal string such as `"18.50"` or `"-3.125"`. */
  static fromDecimal(text: string): Rational {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
    if (!match) throw new RangeError(`invalid decimal "${text}"`);
    const [, sign, whole, fraction = ""] = match;
    const num = BigInt(`${whole}${fraction}`) * (sign ? -1n : 1n);
    return new Rational(num, 10n ** BigInt(fraction.length));
  }

  static readonly ZERO = Rational.of(0);

  add(other: Rational): Rational {
    return new Rational(this.num * other.den + other.num * this.den, this.den * other.den);
  }

  sub(other: Rational): Rational {
    return new Rational(this.num * other.den - other.num * this.den, this.den * other.den);
  }

  mul(other: Rational): Rational {
    return new Rational(this.num * other.num, this.den * other.den);
  }

  div(other: Rational): Rational {
    if (other.num === 0n) throw new RangeError("division by zero");
    return new Rational(this.num * other.den, this.den * other.num);
  }

  compare(other: Rational): number {
    const diff = this.num * other.den - other.num * this.den;
    return diff === 0n ? 0 : diff < 0n ? -1 : 1;
  }

  equals(other: Rational): boolean {
    return this.compare(other) === 0;
  }

  isNegative(): boolean {
    return this.num < 0n;
  }

  /** Rounds to `digits` decimals, half away from zero, and returns a decimal string. */
  toFixed(digits: number): string {
    const scale = 10n ** BigInt(digits);
    const scaled = abs(this.num) * scale;
    let q = scaled / this.den;
    const r = scaled % this.den;
    if (r * 2n >= this.den) q += 1n;
    const negative = this.num < 0n && q !== 0n;
    const text = q.toString().padStart(digits + 1, "0");
    const whole = digits === 0 ? text : text.slice(0, -digits);
    const fraction = digits === 0 ? "" : `.${text.slice(-digits)}`;
    return `${negative ? "-" : ""}${whole}${fraction}`;
  }

  /** Rounded to cents, as an exact rational. */
  roundToCents(): Rational {
    return Rational.fromDecimal(this.toFixed(2));
  }

  toString(): string {
    return `${this.num}/${this.den}`;
  }

  static parse(text: string): Rational {
    const match = /^(-?\d+)\/(\d+)$/.exec(text);
    if (!match) throw new RangeError(`invalid rational "${text}"`);
    return new Rational(BigInt(match[1]), BigInt(match[2]));
  }
}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function sum(values: Rational[]): Rational {
  return values.reduce((acc, v) => acc.add(v), Rational.ZERO);
}

/** `"1480.00"` → `"1,480.00"`. */
export function formatMoney(decimal: string): string {
  const [whole, fraction = "00"] = decimal.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${decimal.startsWith("-") ? "-" : ""}${grouped}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
