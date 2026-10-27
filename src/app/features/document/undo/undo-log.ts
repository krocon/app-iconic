import { signal } from '@angular/core';

/**
 * Debug „Log Undo Grouping“ (legacy §9, design 015 E16): while on, the `UndoService` writes how it
 * groups steps (gestures, merged nudges) to the console. Set from the settings (Advanced).
 */
export const logUndoGrouping = signal(false);

export function logUndo(event: string, label: string, detail?: unknown): void {
  if (!logUndoGrouping()) return;
  if (detail === undefined) console.debug(`[undo] ${event}: ${label}`);
  else console.debug(`[undo] ${event}: ${label}`, detail);
}
