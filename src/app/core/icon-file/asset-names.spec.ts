import { findAsset, imageNames } from './asset-names';
import { IconJson } from './icon-file.models';
import { CAMSCANNER_ICON } from '../../../testing/fixtures/camscanner-icon';

describe('asset-names', () => {
  it('finds assets exactly, then NFC-normalised', () => {
    const assets = [{ name: 'Größe.svg' }, { name: 'a.svg' }];
    expect(findAsset(assets, 'a.svg')).toBe(assets[1]);
    expect(findAsset(assets, 'Größe.svg')).toBe(assets[0]);
    expect(findAsset(assets, 'A.svg')).toBeUndefined();
  });

  it('lists the image names of the fixture', () => {
    const icon = JSON.parse(CAMSCANNER_ICON.iconJson) as IconJson;
    expect(imageNames(icon)).toEqual(['logo-scanner 3.svg', 'logo-scanner-2 2.svg']);
    expect(imageNames({})).toEqual([]);
    expect(imageNames({ groups: [{ layers: [{ name: 'only specializations' }] }] })).toEqual([]);
  });
});
