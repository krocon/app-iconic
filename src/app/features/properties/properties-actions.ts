import { DestroyRef } from '@angular/core';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { PropertiesService } from './properties.service';

/**
 * Actions of the properties panel (design 009 E11, AI rule): `properties.set { name, value,
 * constrain? }`, `properties.reset { name }`, `properties.resetAll { confirm? }`. The transform
 * list is `properties.set { name: 'transform' }`.
 */
export function registerPropertiesActions(
  actions: ActionService,
  props: PropertiesService,
  destroyRef?: DestroyRef,
): void {
  const hasNodes = () => (props.store?.selection().length ?? 0) > 0;
  const handlers: Record<string, ActionHandler> = {
    'properties.set': {
      run: (args) => {
        const a = args as { name: string; value: string; constrain?: boolean };
        props.set(a.name, a.value, a.constrain);
      },
      enabled: hasNodes,
    },
    'properties.reset': {
      run: (args) => props.reset((args as { name: string }).name),
      enabled: hasNodes,
    },
    'properties.resetAll': {
      run: (args) => props.resetAll((args as { confirm?: boolean } | undefined)?.confirm),
      enabled: () => {
        const s = props.store;
        return !!s && s.selection().length > 0 && props.canResetAll(s);
      },
    },
  };
  for (const [id, h] of Object.entries(handlers)) actions.register(id, h, destroyRef);
}
