import { PanelRow } from './panel-model';

/** Attributes shown side by side (prompt 073 E1): first and second of each pair. */
export const PAIRS: readonly (readonly [string, string])[] = [
  ['x', 'y'],
  ['width', 'height'],
  ['rx', 'ry'],
  ['cx', 'cy'],
  ['x1', 'y1'],
  ['x2', 'y2'],
];

/** Short labels in a pair (like the Box section, 062): the full name stays the tooltip. */
export const SHORT_LABELS: Readonly<Record<string, string>> = {
  x: 'X',
  y: 'Y',
  width: 'W',
  height: 'H',
  rx: 'RX',
  ry: 'RY',
  cx: 'CX',
  cy: 'CY',
  x1: 'X1',
  y1: 'Y1',
  x2: 'X2',
  y2: 'Y2',
};

export type RowItem =
  | { kind: 'single'; key: string; row: PanelRow }
  | { kind: 'pair'; key: string; rows: readonly [PanelRow, PanelRow] };

/**
 * The rows of a section with known pairs side by side (prompt 073 E1), pure: a pair forms when its
 * second attribute follows the first directly – the order of the specs stays as it is.
 */
export function pairRows(rows: readonly PanelRow[]): RowItem[] {
  const out: RowItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const pair = b && PAIRS.find(([x, y]) => x === a.def.name && y === b.def.name);
    if (pair) {
      out.push({ kind: 'pair', key: `${a.def.name}+${b.def.name}`, rows: [a, b] });
      i++;
    } else {
      out.push({ kind: 'single', key: a.def.name, row: a });
    }
  }
  return out;
}
