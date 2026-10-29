import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { CornerOverlay } from '../corners/corner-overlay';
import { DimensionOverlay } from '../dimension/dimension-overlay';
import { PathEditOverlay } from '../path-edit/path-edit-overlay';
import { PathfinderOverlay } from '../pathfinder/pathfinder-overlay';
import { PatternOverlay } from '../pattern/pattern-overlay';
import { TrimOverlay } from '../trim/trim-overlay';

/**
 * The overlays of the construction tools (prompts 045–050) in one place: each draws only while its
 * tool is on, all in viewport pixels over the canvas.
 */
@Component({
  selector: 'app-tool-overlays',
  imports: [
    CornerOverlay,
    PathEditOverlay,
    PathfinderOverlay,
    DimensionOverlay,
    PatternOverlay,
    TrimOverlay,
  ],
  template: `
    <app-corner-overlay [toView]="toView()" />
    <app-path-edit-overlay [toView]="toView()" />
    <app-pathfinder-overlay [toView]="toView()" />
    <app-dimension-overlay [toView]="toView()" />
    <app-pattern-overlay [toView]="toView()" />
    <app-trim-overlay [toView]="toView()" />
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolOverlays {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
}
