import { signal } from '@angular/core';
import { ThemeChoice } from './settings.models';

/**
 * The colour scheme of the app (design 015 E15): `data-theme` on `<html>` forces light or dark,
 * without it `styles.css` follows `prefers-color-scheme`. {@link themeChange} is bumped after
 * every switch – canvas painters (rulers) read their tokens again.
 */
export const themeChange = signal(0);

export function applyTheme(root: HTMLElement, theme: ThemeChoice): void {
  const now = root.getAttribute('data-theme');
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  if (now !== root.getAttribute('data-theme')) themeChange.update((n) => n + 1);
}
