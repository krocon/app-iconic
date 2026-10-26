import { Injectable } from '@angular/core';
import { KeymapApi, MenuApi } from '../app/core/menu/menu-api';
import { KeymapOverrides, MenuSpec } from '../app/core/menu/menu.models';

/**
 * Test double of {@link MenuApi}: keeps the last spec, `click(id)` plays a click in the native
 * menu (design 005 E18). Never imported by app code.
 */
@Injectable()
export class FakeMenuApi extends MenuApi {
  specs: MenuSpec[] = [];
  private handler: ((id: string) => void) | null = null;

  get spec(): MenuSpec | null {
    return this.specs.at(-1) ?? null;
  }

  async setAppMenu(spec: MenuSpec): Promise<void> {
    this.specs.push(spec);
  }

  async onAction(fn: (id: string) => void): Promise<() => void> {
    this.handler = fn;
    return () => (this.handler = null);
  }

  click(id: string): void {
    this.handler?.(id);
  }
}

/** Test double of {@link KeymapApi} with fixed overrides. */
@Injectable()
export class FakeKeymapApi extends KeymapApi {
  overrides: KeymapOverrides = { bindings: {}, warning: null };

  async loadOverrides(): Promise<KeymapOverrides> {
    return this.overrides;
  }
}
