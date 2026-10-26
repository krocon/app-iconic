/** Texts of the hierarchy placeholder (prompt 006 builds the real tree). */
export const HIERARCHY_TEXTS = {
  groups: 'Groups and layers',
  group: (n: number) => `Group ${n}`,
  layer: 'layer',
  noImage: 'no image',
  missing: 'missing',
  opacity: (o: number) => `opacity ${o}`,
  assets: 'Assets',
  noGroups: 'No groups.',
} as const;
