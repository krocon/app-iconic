/**
 * `icon.json` as Icon Composer writes it (design 010 E12; the same format as Rust
 * `ai-core::icon::json_format`): two spaces, `"key" : value`, no newline at the end, an empty
 * list as `[` + empty line + `]`, empty objects `{}`. For the preview – Rust writes the file. Pure.
 */
export function formatIconJson(value: unknown, indent = 0): string {
  const pad = (n: number) => '  '.repeat(n);
  if (Array.isArray(value)) {
    if (value.length === 0) return `[\n\n${pad(indent)}]`;
    const items = value.map((v) => pad(indent + 1) + formatIconJson(v, indent + 1));
    return `[\n${items.join(',\n')}\n${pad(indent)}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const items = entries.map(
      ([k, v]) => `${pad(indent + 1)}${JSON.stringify(k)} : ${formatIconJson(v, indent + 1)}`,
    );
    return `{\n${items.join(',\n')}\n${pad(indent)}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The lines of `after` that differ from `before` (common start and end removed); `null` if equal.
 * A pure deletion marks the line where it happened.
 */
export function changedLines(before: string, after: string): { from: number; to: number } | null {
  if (before === after) return null;
  const a = before.split('\n');
  const b = after.split('\n');
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
  const to = b.length - end;
  if (to > start) return { from: start, to };
  const at = Math.min(Math.max(start - 1, 0), b.length - 1);
  return { from: at, to: at + 1 };
}
