import { IconDocument } from '../app/features/document/icon-document';

/**
 * A document for the hierarchy tests (design 006): two groups.
 * - group 0 "Front": layer "A" → a.svg, layer "A2" → a.svg (shared asset)
 * - group 1: layer "B" → b.svg, layer "P" → p.png
 * a.svg: n1 svg → n2 defs → n3 linearGradient#lg → (n4, n5 stop); n6 g#grp → (n7 rect, n8 circle);
 *        n9 path fill=url(#lg); n10 text "Hello"
 * b.svg: n11 svg → n12 rect#r
 */
export function treeDocument(): IconDocument {
  return IconDocument.fromDto({
    path: '/t.icon',
    name: 't.icon',
    format: 'bundle',
    iconJson: {
      fill: 'automatic',
      groups: [
        {
          name: 'Front',
          layers: [
            { 'image-name': 'a.svg', name: 'A' },
            { 'image-name': 'a.svg', name: 'A2' },
          ],
        },
        {
          layers: [
            { 'image-name': 'b.svg', name: 'B' },
            { 'image-name': 'p.png', name: 'P' },
          ],
        },
      ],
    },
    assets: [
      {
        name: 'a.svg',
        kind: 'svg',
        text:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
          '<defs><linearGradient id="lg"><stop offset="0" stop-color="red"/>' +
          '<stop offset="1" stop-color="#00f"/></linearGradient></defs>' +
          '<g id="grp"><rect width="10" height="20" fill="white" stroke="none"/>' +
          '<circle r="5" style="fill: rgb(0, 128, 0)"/></g>' +
          '<path d="M0 0" fill="url(#lg)" stroke="currentColor"/><text>Hello</text></svg>',
      },
      {
        name: 'b.svg',
        kind: 'svg',
        text: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="r" width="1" height="1"/></svg>',
      },
      { name: 'p.png', kind: 'png', dataUrl: 'data:image/png;base64,AAAA' },
    ],
    warnings: [],
  });
}
