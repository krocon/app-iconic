/** Texts of the clip path functions (design 014). English is the source; German in prompt 015. */
export const CLIP_TEXTS = {
  section: 'Clip Path',
  clip: 'Clip',
  layerClip: 'Layer clip',
  none: 'None',
  inherit: 'Inherit from Layer',
  other: (v: string) => `Other: ${v}`,
  units: 'Units',
  unitLabels: { userSpaceOnUse: 'User space', objectBoundingBox: 'Bounding box' } as Record<
    string,
    string
  >,
  create: 'Create Clip Path',
  edit: 'Edit Clip Path',
  remove: 'Remove…',
  done: 'Done',
  editing: (id: string) => `Editing clip path #${id}`,
  editingHint: 'Esc or Done to finish',
  inheritedFrom: (id: string) => `Clipped by the layer clip #${id}`,
  inheritedGroup: (id: string) => `Clipped by a group with #${id}`,
  alsoClipped: (id: string) => `Also clipped by #${id} (they intersect)`,
  noneBlocked: 'Inside a clipped group – move it to the layer level to remove the clip.',
  users: (n: number) => (n === 1 ? 'Used by 1 element' : `Used by ${n} elements`),
  unused: 'Not used',
  obbShared: 'Bounding box units follow each element that uses the clip.',
  deleteTitle: (id: string) => `Delete Clip Path “${id}”?`,
  deleteMessage: (n: number) =>
    n === 1
      ? '1 element uses it. Its clipping is removed.'
      : `${n} elements use it. Their clipping is removed.`,
  deleteMany: (n: number) => `${n} clip paths are used. Their references are removed.`,
  deleteButton: 'Delete',
  cancelButton: 'Cancel',
  failed: 'The clip path could not be changed.',
  treeBadge: (id: string) => `Clipped by #${id}`,
  layerClipGroup: 'Layer Clip',
} as const;
