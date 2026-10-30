import { Injectable } from '@angular/core';

/** A row of swatches in the colour popover (prompt 074 E1). */
export interface SwatchGroup {
  id: string;
  label: string;
  colors: readonly string[];
}

/**
 * Where the colour popover gets its swatches from (prompt 074): the document's colours, the recently
 * used ones and the user's palette come from the app (`ColorLibrary` in `features/color`); without
 * it (tests of the controls) there are none. Generic – `shared` knows no features.
 */
@Injectable({ providedIn: 'root', useFactory: () => new NoSwatches() })
export abstract class ColorSwatches {
  abstract groups(): readonly SwatchGroup[];
  /** A colour was chosen (recently used). */
  abstract used(color: string): void;
  /** "Add to palette". */
  abstract addToPalette(color: string): void;
}

export class NoSwatches extends ColorSwatches {
  groups(): readonly SwatchGroup[] {
    return [];
  }
  used(): void {
    // nowhere to remember
  }

  addToPalette(): void {
    // no palette
  }
}
