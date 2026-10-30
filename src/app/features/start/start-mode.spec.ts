import { startMode } from './start-mode';

describe('startMode (design 082 E1)', () => {
  it('a start file (argv, Finder, second start – 030) never shows the start screen', () => {
    for (const startup of ['startScreen', 'emptyDocument'] as const) {
      expect(startMode({ path: '/a.icon', action: null, startup })).toBe('file');
      expect(startMode({ path: '/a.icon', action: 'file.open', startup })).toBe('file');
    }
  });

  it('a window opened for an action (Open Recent without a window) starts as before', () => {
    expect(startMode({ path: null, action: 'file.recent.1', startup: 'startScreen' })).toBe(
      'action',
    );
  });

  it('otherwise the setting decides', () => {
    expect(startMode({ path: null, action: null, startup: 'startScreen' })).toBe('screen');
    expect(startMode({ path: null, action: null, startup: 'emptyDocument' })).toBe('empty');
  });
});
