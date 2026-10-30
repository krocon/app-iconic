/**
 * Android and web packages (prompt 079): the platform numbers, which groups go on which adaptive
 * layer, the file names Rust writes (`export/android.rs`, `export/web.rs`) and the texts the
 * dialog offers to copy. Pure. Sources of the numbers in the design (079 "Belege").
 */

/** Adaptive icon layers: 108 dp; the masked viewport 72 dp, the safe zone 66 dp (Android). */
export const ANDROID_LAYER_DP = 108;
export const ANDROID_VIEWPORT_DP = 72;
export const ANDROID_SAFE_DP = 66;
/** The `.icon` canvas becomes the 72 dp viewport of the 108 dp layer (design 079 E3). */
export const ANDROID_CANVAS_SCALE = ANDROID_VIEWPORT_DP / ANDROID_LAYER_DP;

/** Maskable PWA icon: safe zone = centred circle, radius 40 % of the icon (web.dev). */
export const WEB_SAFE_RADIUS = 0.4;
/** The canvas in the maskable icon: its inscribed circle is the safe zone (design 079 E7). */
export const WEB_MASKABLE_SCALE = 2 * WEB_SAFE_RADIUS;

/** Density buckets with their scale (Android `mipmap-<density>`; Rust `android::DENSITIES`). */
export const ANDROID_DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const;

/**
 * The adaptive layers (design 079 E4): `backgroundGroups` (icon.json indexes) are drawn on the
 * background layer together with the icon fill, every other group on the foreground. Unknown
 * indexes are ignored; both lists ascending, without duplicates.
 */
export function androidLayers(
  groupCount: number,
  backgroundGroups: readonly number[],
): { foreground: number[]; background: number[] } {
  const all = Array.from({ length: Math.max(0, groupCount) }, (_, i) => i);
  const bg = new Set(backgroundGroups);
  return {
    foreground: all.filter((i) => !bg.has(i)),
    background: all.filter((i) => bg.has(i)),
  };
}

/** Group indexes of an AI argument: a list of integers ≥ 0, else `null`. */
export function parseGroupIndexes(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x) && x >= 0 && x < 10_000))
    return null;
  return [...new Set(v as number[])].sort((a, b) => a - b);
}

/** The files of the Android set inside `android/` (mirror of the Rust plan). */
export function androidFiles(monochrome: boolean): string[] {
  const files = [
    'res/mipmap-anydpi-v26/ic_launcher.xml',
    'res/mipmap-anydpi-v26/ic_launcher_round.xml',
  ];
  for (const [d] of ANDROID_DENSITIES) {
    const names = [
      'ic_launcher',
      'ic_launcher_round',
      'ic_launcher_foreground',
      'ic_launcher_background',
    ];
    if (monochrome) names.push('ic_launcher_monochrome');
    files.push(...names.map((n) => `res/mipmap-${d}/${n}.png`));
  }
  files.push('ic_launcher-playstore.png');
  return files;
}

/** The files of the web set inside `web/` (mirror of the Rust plan). */
export const WEB_FILES: readonly string[] = [
  'favicon.ico',
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'manifest.webmanifest',
  'snippet.html',
];

/** `manifest.webmanifest` (Rust `web::MANIFEST`, testdata/export/web): the icons to merge. */
export const WEB_MANIFEST = `{
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
`;

/** `snippet.html` (Rust `web::SNIPPET`): the `<link>` tags for `<head>`. */
export const WEB_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
`;
