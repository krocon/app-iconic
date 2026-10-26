/** One tick of a ruler: viewport pixel `pos`, document value `value`. */
export interface RulerTick {
  pos: number;
  value: number;
  major: boolean;
}

/** Major ticks are at least this many pixels apart. */
export const MIN_MAJOR_PX = 50;

/**
 * Spacing of a ruler in document units (design 004 E12): the smallest step of the 1-2-5 series
 * whose major ticks are at least {@link MIN_MAJOR_PX} apart; 5 minor ticks per major (4 for
 * steps 2·10ⁿ, so that minors stay at round values).
 */
export function rulerStep(zoom: number): { major: number; minor: number } {
  const want = MIN_MAJOR_PX / zoom;
  let mag = 10 ** Math.floor(Math.log10(want));
  for (;;) {
    for (const base of [1, 2, 5]) {
      const major = base * mag;
      if (major >= want - 1e-9) return { major, minor: major / (base === 2 ? 4 : 5) };
    }
    mag *= 10;
  }
}

/**
 * The ticks of a ruler `length` pixels long whose pixel 0 shows document value `-offset / zoom`
 * (`offset` = pan of that axis). Pure – the component draws them.
 */
export function rulerTicks(zoom: number, offset: number, length: number): RulerTick[] {
  const { major, minor } = rulerStep(zoom);
  const first = Math.ceil(-offset / zoom / minor);
  const last = Math.floor((length - offset) / zoom / minor);
  const ticks: RulerTick[] = [];
  const perMajor = Math.round(major / minor);
  for (let i = first; i <= last; i++) {
    const value = round(i * minor);
    ticks.push({ pos: value * zoom + offset, value, major: i % perMajor === 0 });
  }
  return ticks;
}

/** Avoids 0.30000000000000004 in labels. */
function round(v: number): number {
  return Math.round(v * 1e6) / 1e6 || 0;
}
