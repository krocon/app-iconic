import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { previewPaint } from './symbol-picker-model';
import { SymbolSvg } from './symbol-provider';

/**
 * The preview of one symbol in the picker (design 013 E20, 084 E13): Angular bindings on `<path>`
 * (no `innerHTML`) – the group's paint and every path's own paint, transform and opacity.
 */
@Component({
  selector: 'app-symbol-tile',
  template: `
    @let s = svg();
    @let g = s.group.attrs;
    <svg aria-hidden="true" overflow="visible" [attr.viewBox]="'0 0 ' + s.width + ' ' + s.height">
      <g
        [attr.fill]="paint(g['fill'])"
        [attr.stroke]="paint(g['stroke'])"
        [attr.stroke-width]="g['stroke-width']"
        [attr.stroke-linecap]="g['stroke-linecap']"
        [attr.stroke-linejoin]="g['stroke-linejoin']"
      >
        @for (c of s.group.children; track $index) {
          <path
            [attr.d]="c.attrs['d']"
            [attr.transform]="c.attrs['transform']"
            [attr.fill]="paint(c.attrs['fill'])"
            [attr.stroke]="paint(c.attrs['stroke'])"
            [attr.stroke-width]="c.attrs['stroke-width']"
            [attr.stroke-linecap]="c.attrs['stroke-linecap']"
            [attr.stroke-linejoin]="c.attrs['stroke-linejoin']"
            [attr.stroke-miterlimit]="c.attrs['stroke-miterlimit']"
            [attr.stroke-dasharray]="c.attrs['stroke-dasharray']"
            [attr.stroke-dashoffset]="c.attrs['stroke-dashoffset']"
            [attr.fill-rule]="c.attrs['fill-rule']"
            [attr.fill-opacity]="c.attrs['fill-opacity']"
            [attr.stroke-opacity]="c.attrs['stroke-opacity']"
            [attr.opacity]="c.attrs['opacity']"
          />
        }
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: contents;
    }
    svg {
      width: 60%;
      height: 60%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SymbolTile {
  readonly svg = input.required<SymbolSvg>();
  readonly colored = input(false);

  protected paint(v: string | undefined): string | null {
    return previewPaint(v, this.colored());
  }
}
