import { TestBed } from '@angular/core/testing';
import { THIN_LINE } from '../../core/settings/settings.models';
import { SettingsStore } from '../settings/settings.store';
import { isArcPath, readStyle, styleAttrs, styleKindOf } from './draw-style';
import { StyleMemory } from './style-memory';

const NS = 'http://www.w3.org/2000/svg';

function el(markup: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${NS}">${markup}</svg>`,
    'image/svg+xml',
  );
  return doc.documentElement.firstElementChild!;
}

describe('remembered paint (design 019 E12)', () => {
  it('knows the kind of a shape; an arc is a path of one move and one arc', () => {
    expect(styleKindOf(el('<rect/>'))).toBe('rect');
    expect(styleKindOf(el('<polyline/>'))).toBe('polyline');
    expect(styleKindOf(el('<path d="M 0 0 A 10 10 0 0 1 20 0"/>'))).toBe('arc');
    expect(styleKindOf(el('<path d="M0 0 L 10 10"/>'))).toBe('path');
    expect(styleKindOf(el('<text>x</text>'))).toBeNull();
    expect(styleKindOf(el('<g/>'))).toBeNull();
    expect(isArcPath('m0 0a5 5 0 0 0 10 0')).toBe(true);
    expect(isArcPath('M0 0 A5 5 0 0 0 10 0 Z')).toBe(false);
  });

  it('reads the own style before the attribute; drops unsafe values', () => {
    const s = readStyle(
      el(
        '<rect fill="red" stroke="blue" style="stroke: green" stroke-width="3" opacity="url(#x)"/>',
      ),
    );
    expect(s).toEqual({
      ...Object.fromEntries(Object.keys(THIN_LINE).map((k) => [k, ''])),
      fill: 'red',
      stroke: 'green',
      strokeWidth: '3',
    });
  });

  it('writes only what is set', () => {
    expect(styleAttrs(THIN_LINE)).toEqual({ fill: 'none', stroke: '#000000', 'stroke-width': '1' });
  });

  it('remembers per kind in the settings', () => {
    TestBed.configureTestingModule({});
    const memory = TestBed.inject(StyleMemory);
    const settings = TestBed.inject(SettingsStore);
    expect(memory.attrs('circle')).toEqual({
      fill: 'none',
      stroke: '#000000',
      'stroke-width': '1',
    });
    memory.record(el('<circle fill="#00ff00" stroke="#123456" stroke-width="5"/>'));
    expect(memory.attrs('circle')).toEqual({
      fill: '#00ff00',
      stroke: '#123456',
      'stroke-width': '5',
    });
    // another kind keeps its own
    expect(memory.attrs('rect')).toEqual({ fill: 'none', stroke: '#000000', 'stroke-width': '1' });
    expect(settings.settings().drawing.styles.circle.stroke).toBe('#123456');
    // a fill it does not state itself (class, gradient) keeps the remembered one – no black fill
    memory.record(el('<circle fill="url(#g)" stroke-width="7"/>'));
    expect(memory.attrs('circle')).toEqual({
      fill: '#00ff00',
      stroke: '#123456',
      'stroke-width': '7',
    });
    memory.record(el('<text fill="red">x</text>'));
    expect(settings.settings().drawing.styles.rect).toEqual(THIN_LINE);
  });
});
