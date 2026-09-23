import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  clockToMinutes,
  dayOfWeek,
  dstTransitions,
  elapsedWallMinutes,
  formatClock12,
  intervalMinutes,
  minutesToClock,
  toForm1Clock,
  toUsDate,
} from "@/lib/domain/time";

describe("civil time", () => {
  it("round-trips clock times", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1439 }), (m) => clockToMinutes(minutesToClock(m)) === m));
  });

  it("formats 12-hour clocks", () => {
    expect(formatClock12("07:40")).toBe("7:40 AM");
    expect(formatClock12("00:05")).toBe("12:05 AM");
    expect(formatClock12("12:00")).toBe("12:00 PM");
    expect(formatClock12("16:30")).toBe("4:30 PM");
    expect(toForm1Clock("16:30")).toEqual({ time: "4:30", meridiem: "pm" });
  });

  it("rejects invalid times and dates", () => {
    expect(() => clockToMinutes("24:00")).toThrow();
    expect(() => clockToMinutes("7:40")).toThrow();
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });

  it("does calendar arithmetic without the host timezone", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(dayOfWeek("2026-09-01")).toBe(2);
    expect(toUsDate("2026-09-01")).toBe("09/01/2026");
  });

  it("moves an overnight end to the next day", () => {
    expect(intervalMinutes("22:00", "06:00")).toEqual({ startMinute: 1320, endMinute: 1800 });
  });
});

describe("daylight saving in California", () => {
  it("knows the 2026 transitions", () => {
    expect(dstTransitions(2026)).toEqual({ springForward: "2026-03-08", fallBack: "2026-11-01" });
  });

  it("counts a spring-forward overnight shift one hour shorter", () => {
    const { startMinute, endMinute } = intervalMinutes("22:00", "06:00");
    expect(elapsedWallMinutes("2026-03-07", startMinute, endMinute)).toEqual({ ok: true, minutes: 420, dstAdjustment: -60 });
  });

  it("counts a fall-back overnight shift one hour longer", () => {
    const { startMinute, endMinute } = intervalMinutes("22:00", "06:00");
    expect(elapsedWallMinutes("2026-10-31", startMinute, endMinute)).toEqual({ ok: true, minutes: 540, dstAdjustment: 60 });
  });

  it("refuses readings in the skipped or repeated hour", () => {
    expect(elapsedWallMinutes("2026-03-08", clockToMinutes("02:30"), clockToMinutes("09:00")).ok).toBe(false);
    expect(elapsedWallMinutes("2026-11-01", clockToMinutes("01:30"), clockToMinutes("09:00")).ok).toBe(false);
  });

  it("leaves ordinary days alone", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1438 }), fc.integer({ min: 1, max: 1439 }), (start, length) => {
        const result = elapsedWallMinutes("2026-09-01", start, start + length);
        return result.ok && result.minutes === length;
      }),
    );
  });
});
