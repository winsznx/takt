import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatMoney, Rational } from "@/lib/calc/rational";

describe("Rational", () => {
  it("parses decimals exactly", () => {
    expect(Rational.fromDecimal("0.1").add(Rational.fromDecimal("0.2")).equals(Rational.fromDecimal("0.3"))).toBe(true);
    expect(Rational.fromDecimal("18.50").toString()).toBe("37/2");
  });

  it("rounds half away from zero", () => {
    expect(Rational.of(1, 200).toFixed(2)).toBe("0.01");
    expect(Rational.of(-1, 200).toFixed(2)).toBe("-0.01");
    expect(Rational.of(1, 300).toFixed(2)).toBe("0.00");
    expect(Rational.of(2824221, 2000).toFixed(2)).toBe("1412.11");
    expect(Rational.of(-1, 1000).toFixed(2)).toBe("0.00");
  });

  it("matches integer-cent arithmetic for minute × rate", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), fc.integer({ min: 1690, max: 20_000 }), (minutes, cents) => {
        const exact = Rational.of(minutes).mul(Rational.of(cents, 100)).div(Rational.of(60));
        const scaled = BigInt(minutes) * BigInt(cents);
        const q = scaled / 60n;
        const r = scaled % 60n;
        const rounded = r * 2n >= 60n ? q + 1n : q;
        return exact.toFixed(2) === (Number(rounded) / 100).toFixed(2);
      }),
    );
  });

  it("formats money with thousands separators", () => {
    expect(formatMoney("1480.00")).toBe("1,480.00");
    expect(formatMoney("-74.5")).toBe("-74.50");
    expect(formatMoney("1234567.89")).toBe("1,234,567.89");
  });
});
