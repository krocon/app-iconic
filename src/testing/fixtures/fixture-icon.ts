/** Shape of the generated fixture modules (`scripts/fixtures.mjs`, design 002 E16). */
export interface FixtureIcon {
  /** Bundle name, e.g. `camscanner.icon`. */
  name: string;
  /** `icon.json` exactly as in the file. */
  iconJson: string;
  /** SVG assets as text, sorted by name. */
  assets: { name: string; text: string }[];
}
