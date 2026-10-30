/** One line of a diff: kept, added or removed. */
export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
}

/** Lines above this count are compared without LCS (a configuration is small; 1 MiB at most). */
const MAX_CELLS = 4_000_000;

const lines = (t: string | null): string[] => {
  if (t === null || t === '') return [];
  const l = t.split('\n');
  if (l[l.length - 1] === '') l.pop();
  return l;
};

/**
 * Line diff of `before` → `after` (prompt 086 E4), pure: longest common subsequence, removed
 * lines before added ones. Huge inputs: everything removed, then everything added.
 */
export function lineDiff(before: string | null, after: string | null): DiffLine[] {
  const a = lines(before);
  const b = lines(after);
  // common start and end first – the usual case is a small change in the middle
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end++;
  }
  const head = a.slice(0, start).map((text) => ({ kind: 'same' as const, text }));
  const tail = a.slice(a.length - end).map((text) => ({ kind: 'same' as const, text }));
  const x = a.slice(start, a.length - end);
  const y = b.slice(start, b.length - end);
  return [...head, ...middle(x, y), ...tail];
}

function middle(x: string[], y: string[]): DiffLine[] {
  const del = (text: string): DiffLine => ({ kind: 'del', text });
  const add = (text: string): DiffLine => ({ kind: 'add', text });
  if ((x.length + 1) * (y.length + 1) > MAX_CELLS) return [...x.map(del), ...y.map(add)];
  const n = x.length;
  const m = y.length;
  // lcs[i][j] = LCS length of x[i..] and y[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: 'same', text: x[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(del(x[i++]));
    } else {
      out.push(add(y[j++]));
    }
  }
  while (i < n) out.push(del(x[i++]));
  while (j < m) out.push(add(y[j++]));
  return out;
}
