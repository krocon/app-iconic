import { describe, expect, it } from 'vitest';
import { clampWidth, dragWidth, keyWidth } from './panel-width';

describe('panel width (design 015 E10)', () => {
  it('clamps to 160…480 and rounds', () => {
    expect(clampWidth(100)).toBe(160);
    expect(clampWidth(900)).toBe(480);
    expect(clampWidth(250.6)).toBe(251);
    expect(clampWidth(Number.NaN)).toBe(160);
  });

  it('dragging: a left panel grows to the right, a right panel to the left', () => {
    expect(dragWidth(260, 40, 'end')).toBe(300);
    expect(dragWidth(300, 40, 'start')).toBe(260);
    expect(dragWidth(260, -500, 'end')).toBe(160);
    expect(dragWidth(300, -500, 'start')).toBe(480);
  });

  it('keys: arrows 10 px (⇧ 40), Home/End, others not', () => {
    expect(keyWidth(260, 'ArrowRight', false, 'end')).toBe(270);
    expect(keyWidth(260, 'ArrowLeft', true, 'end')).toBe(220);
    expect(keyWidth(300, 'ArrowLeft', false, 'start')).toBe(310);
    expect(keyWidth(300, 'ArrowRight', true, 'start')).toBe(260);
    expect(keyWidth(475, 'ArrowRight', false, 'end')).toBe(480);
    expect(keyWidth(260, 'Home', false, 'end')).toBe(160);
    expect(keyWidth(260, 'End', false, 'start')).toBe(480);
    expect(keyWidth(260, 'ArrowUp', false, 'end')).toBeNull();
  });
});
