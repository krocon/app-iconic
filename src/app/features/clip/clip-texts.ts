import { translatable } from '../../core/i18n/i18n';

/** Texts of the clip path functions (design 014). English is the source, German beside it. */
const EN = {
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

export const CLIP_TEXTS = translatable('clip', EN, {
  de: {
    section: 'Beschneidungspfad',
    clip: 'Beschneidung',
    layerClip: 'Beschneidung der Ebene',
    none: 'Keine',
    inherit: 'Von der Ebene erben',
    other: (v: string) => `Andere: ${v}`,
    units: 'Einheiten',
    unitLabels: { userSpaceOnUse: 'Nutzerraum', objectBoundingBox: 'Begrenzungsrahmen' },
    create: 'Beschneidungspfad anlegen',
    edit: 'Beschneidungspfad bearbeiten',
    remove: 'Entfernen …',
    done: 'Fertig',
    editing: (id: string) => `Beschneidungspfad #${id} wird bearbeitet`,
    editingHint: 'Esc oder „Fertig“ beendet',
    inheritedFrom: (id: string) => `Beschnitten durch die Ebenen-Beschneidung #${id}`,
    inheritedGroup: (id: string) => `Beschnitten durch eine Gruppe mit #${id}`,
    alsoClipped: (id: string) => `Zusätzlich beschnitten durch #${id} (Schnittmenge)`,
    noneBlocked:
      'Liegt in einer beschnittenen Gruppe – auf die Ebene verschieben, um die Beschneidung zu entfernen.',
    users: (n: number) => (n === 1 ? 'Von 1 Element benutzt' : `Von ${n} Elementen benutzt`),
    unused: 'Nicht benutzt',
    obbShared: 'Einheiten des Begrenzungsrahmens folgen jedem Element, das die Beschneidung nutzt.',
    deleteTitle: (id: string) => `Beschneidungspfad „${id}“ löschen?`,
    deleteMessage: (n: number) =>
      n === 1
        ? '1 Element benutzt ihn. Seine Beschneidung wird entfernt.'
        : `${n} Elemente benutzen ihn. Ihre Beschneidung wird entfernt.`,
    deleteMany: (n: number) =>
      `${n} Beschneidungspfade werden benutzt. Die Verweise werden entfernt.`,
    deleteButton: 'Löschen',
    cancelButton: 'Abbrechen',
    failed: 'Der Beschneidungspfad konnte nicht geändert werden.',
    treeBadge: (id: string) => `Beschnitten durch #${id}`,
    layerClipGroup: 'Ebenen-Beschneidung',
  },
});
