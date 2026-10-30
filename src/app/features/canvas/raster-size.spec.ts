import {
  clearRasterSizes,
  knownRasterSize,
  loadRasterSize,
  rasterSizeVersion,
  rememberRasterSize,
} from './raster-size';

describe('raster sizes (prompt 080 E7)', () => {
  afterEach(() => clearRasterSizes());

  it('remembers sizes from the image header and counts new entries', async () => {
    expect(knownRasterSize('data:x')).toBeNull();
    rememberRasterSize('data:x', 355, 317);
    rememberRasterSize('data:x', 355, 317);
    rememberRasterSize('data:y', 0, 10);
    expect(knownRasterSize('data:x')).toEqual({ width: 355, height: 317 });
    expect(knownRasterSize('data:y')).toBeNull();
    expect(rasterSizeVersion()).toBe(1);
    expect(await loadRasterSize('data:x')).toEqual({ width: 355, height: 317 });
  });
});
