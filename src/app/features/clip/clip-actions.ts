import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ClipArgs, ClipService } from './clip.service';

/**
 * The clip path actions (design 014 E14, AI rule): `clip.create { node?, layer?, shape?, markup?,
 * id? }`, `clip.assign { node?, layer?, clip?, mode? }`, `clip.edit { clip?, asset?, … }`,
 * `clip.done`, `clip.remove { …, confirm? }`, `clip.setUnits { units, … }`. Without a target the
 * selection counts.
 */
export function registerClipActions(
  actions: ActionService,
  clip: ClipService,
  destroyRef?: DestroyRef,
): void {
  const a = (v: unknown) => v as ClipArgs | undefined;
  actions.registerAll(
    {
      'clip.create': { run: (v) => void clip.create(a(v)), enabled: (v) => clip.canCreate(a(v)) },
      'clip.assign': {
        run: (v) => void clip.assign(a(v)),
        enabled: (v) => clip.canCreate(a(v)),
      },
      'clip.edit': { run: (v) => void clip.edit(a(v)), enabled: (v) => clip.canEdit(a(v)) },
      'clip.done': { run: () => void clip.done(), enabled: () => clip.editing.target() !== null },
      'clip.remove': { run: (v) => void clip.remove(a(v)), enabled: (v) => clip.canEdit(a(v)) },
      'clip.setUnits': {
        run: (v) => void clip.setUnits(a(v) ?? {}),
        enabled: (v) => clip.canEdit(a(v)),
      },
    },
    destroyRef,
  );
}
