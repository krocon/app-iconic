import { UNIQUE_NAMES } from '../../../../testing/fixtures/unique-names';
import { layerNameFor, uniqueAssetName, uniqueLayerName } from './unique-names';

/** Same table as the Rust tests (`names.rs`) – both sides must agree. */
describe('unique-names', () => {
  it.each(UNIQUE_NAMES.asset)('asset $base with $existing → $expected', (c) => {
    expect(uniqueAssetName(c.base, c.existing)).toBe(c.expected);
  });

  it.each(UNIQUE_NAMES.layer)('layer $base with $existing → $expected', (c) => {
    expect(uniqueLayerName(c.base, c.existing)).toBe(c.expected);
  });

  it('derives the layer name from the file name', () => {
    expect(layerNameFor('logo.svg')).toBe('logo');
    expect(layerNameFor('a.b.svg')).toBe('a.b');
    expect(layerNameFor('svg')).toBe('svg');
  });
});
