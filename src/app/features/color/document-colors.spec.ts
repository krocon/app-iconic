import { treeDocument } from '../../../testing/tree-documents';
import { commandFromJson, ReplaceColor } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { documentColors, replaceColorCommand } from './document-colors';
import { IconDocument } from '../document/icon-document';

function doc(): IconDocument {
  return IconDocument.fromDto({
    path: '/c.icon',
    name: 'c.icon',
    format: 'bundle',
    iconJson: {
      fill: { solid: 'srgb:1.00000,0.00000,0.00000,1.00000' },
      groups: [{ layers: [{ 'image-name': 'a.svg', name: 'a' }] }],
    },
    assets: [
      {
        name: 'a.svg',
        kind: 'svg',
        text:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
          '<rect width="1" height="1" fill="#f00" stroke="#00FF00"/>' +
          '<circle r="1" style="fill: #FF0000; stroke-width: 2"/>' +
          '<path d="M0 0" fill="rgb(255, 0, 0)" stroke="none"/>' +
          '<rect width="2" height="2" fill="#FF000080"/></svg>',
      },
    ],
    warnings: [],
  });
}

describe('document colours (prompt 074 E4)', () => {
  it('collects every colour normalised, most used first, icon.json included', () => {
    expect(documentColors(doc())).toEqual([
      { color: '#FF0000', count: 4 },
      { color: '#00FF00', count: 1 },
      { color: '#FF000080', count: 1 },
    ]);
    expect(documentColors(treeDocument()).map((c) => c.color)).toContain('#008000');
  });

  it('replaces a colour everywhere as one step; undo; JSON round trip', () => {
    const store = new DocumentStore(doc());
    const before = store.document().snapshot();
    const cmd = replaceColorCommand(store.document(), '#ff0000', '#0000FF')!;
    store.execute(cmd);
    const root = store.document().assets.get('a.svg')!.svg!.root;
    expect(root.querySelector('rect')!.getAttribute('fill')).toBe('#0000FF');
    expect(root.querySelector('circle')!.getAttribute('style')).toBe(
      'fill: #0000FF; stroke-width: 2',
    );
    expect(root.querySelector('path')!.getAttribute('fill')).toBe('#0000FF');
    // another alpha is another colour
    expect(root.querySelectorAll('rect')[1].getAttribute('fill')).toBe('#FF000080');
    expect(JSON.stringify(store.document().iconJson['fill'])).toContain('srgb:0');
    expect(store.undoLabel()).toBe('Undo Replace Color');
    store.undo();
    expect(store.document().snapshot()).toBe(before);
    const json = JSON.parse(JSON.stringify(cmd.toJSON()));
    expect(json.type).toBe('composite');
    expect(json.commands[0]).toEqual({ type: 'replaceColor', from: '#FF0000', to: '#0000FF' });
    store.execute(commandFromJson(json));
    expect(root.querySelector('rect')!.getAttribute('fill')).toBe('#0000FF');
  });

  it('refuses bad colours; nothing to replace is null', () => {
    expect(() => new ReplaceColor('red', '#000000')).toThrow();
    expect(() => commandFromJson({ type: 'replaceColor', from: '#FF0000', to: 'x' })).toThrow();
    expect(replaceColorCommand(doc(), '#123456', '#000000')).toBeNull();
    expect(replaceColorCommand(doc(), '#FF0000', '#FF0000')).toBeNull();
  });
});
