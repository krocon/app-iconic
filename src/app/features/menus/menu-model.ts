import { MAX_RECENT_ACTIONS } from '../../core/actions/action-catalog';
import { Os } from '../../core/actions/platform';
import { formatChord } from '../../core/actions/shortcut';
import { MenuItemSpec, MenuSpec } from '../../core/menu/menu.models';
import { MENUS_TEXTS } from './menus-texts';

/**
 * One model for the native macOS menu and the HTML menu bar (design 005 E5; taken over from
 * editlicious `features/menus/menu-model.ts`, there from comic-commander design 008 E8), with the
 * menus of the old AppIconic (legacy §4, §7, §8). Pure.
 */
export type MenuNode =
  | { kind: 'action'; id: string; label?: string }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: MenuNode[] };

export interface TopMenuNode {
  label: string;
  items: MenuNode[];
}

const a = (id: string, label?: string): MenuNode => ({ kind: 'action', id, label });
const sep: MenuNode = { kind: 'separator' };
const sub = (label: string, items: MenuNode[]): MenuNode => ({ kind: 'submenu', label, items });

export interface MenuInputs {
  /** Display names of the recently used files (newest first). */
  recent: string[];
}

export function buildMenuModel(os: Os, input: MenuInputs): TopMenuNode[] {
  const t = MENUS_TEXTS;
  const recent = input.recent
    .slice(0, MAX_RECENT_ACTIONS)
    .map((name, i) => a(`file.recent.${i + 1}`, name));
  // macOS: About and Quit live in the app menu Rust adds
  const file: MenuNode[] = [
    a('file.newWindow'),
    a('file.new'),
    a('file.open'),
    sub(t.openRecent, [
      ...(recent.length ? recent : [a('file.noRecent')]),
      sep,
      a('file.clearRecent', t.clearRecent),
    ]),
    sep,
    a('file.importSvg'),
    a('file.exportSvg'),
    a('file.exportPng'),
    sep,
    a('file.save'),
    a('file.saveAs'),
    sep,
    a('file.close'),
    ...(os === 'mac' ? [] : [sep, a('app.quit', t.quit)]),
  ];
  const edit: MenuNode[] = [
    a('edit.undo'),
    a('edit.redo'),
    sep,
    a('edit.cut'),
    a('edit.copy'),
    a('edit.paste'),
    a('edit.copyXml'),
    a('edit.duplicate'),
    a('edit.delete'),
    sep,
    a('edit.toggleVisibility'),
    a('edit.editSvg'),
    sep,
    a('edit.selectAll'),
    a('edit.deselect'),
  ];
  const view: MenuNode[] = [
    a('view.commandSidebar'),
    a('view.hierarchy'),
    a('view.properties'),
    sep,
    a('view.rulers'),
    a('view.guides'),
    a('view.background'),
    a('view.crossCursor'),
    a('view.handles'),
    sep,
    a('view.snapToGrid'),
    a('view.magicSnap'),
    sep,
    a('view.zoomIn'),
    a('view.zoomOut'),
    a('view.actualSize'),
    a('view.zoomToFit'),
    a('view.centerCanvas'),
    sep,
    sub(t.appearance, [a('view.appearance.light', t.light), a('view.appearance.dark', t.dark)]),
    sub(t.mask, [
      a('view.mask.squircle', t.maskSquircle),
      a('view.mask.circle', t.maskCircle),
      a('view.mask.none', t.maskNone),
    ]),
    sep,
    a('app.palette'),
  ];
  const add: MenuNode[] = [
    a('add.iconGroup'),
    a('add.container'),
    sep,
    a('add.circle'),
    a('add.ellipse'),
    a('add.rect'),
    a('add.path'),
    a('add.line'),
    a('add.polyline'),
    a('add.polygon'),
    a('add.text'),
    sep,
    a('add.freehand'),
    a('add.textToPath'),
    a('add.symbol'),
    a('add.svgSnippet'),
    a('add.image'),
  ];
  const arrange: MenuNode[] = [
    a('arrange.bringToFront'),
    a('arrange.sendToBack'),
    sep,
    a('arrange.moveUp'),
    a('arrange.moveDown'),
    a('arrange.moveInto'),
    a('arrange.moveOut'),
    sep,
    a('arrange.group'),
    a('arrange.ungroup'),
    sep,
    sub(t.align, [
      a('arrange.align.left', t.alignLeft),
      a('arrange.align.centerH', t.alignCenterH),
      a('arrange.align.right', t.alignRight),
      sep,
      a('arrange.align.top', t.alignTop),
      a('arrange.align.middle', t.alignMiddle),
      a('arrange.align.bottom', t.alignBottom),
    ]),
  ];
  const help: MenuNode[] = [a('app.shortcuts'), ...(os === 'mac' ? [] : [sep, a('app.about')])];
  return [
    { label: t.file, items: file },
    { label: t.edit, items: edit },
    { label: t.view, items: view },
    { label: t.add, items: add },
    { label: t.arrange, items: arrange },
    { label: t.help, items: help },
  ];
}

/** Every action id of a menu tree. */
export function actionIds(items: readonly MenuNode[]): string[] {
  return items.flatMap((i) =>
    i.kind === 'action' ? [i.id] : i.kind === 'submenu' ? actionIds(i.items) : [],
  );
}

/** What the menus ask about an action. */
export interface ActionLookup {
  label(id: string): string;
  enabled(id: string): boolean;
  checked(id: string): boolean | undefined;
  /** First chord (canonical) the native menu can take, `''` = none. */
  chord(id: string): string;
  /** First chord of all (the HTML bar shows Delete, Esc too). */
  anyChord(id: string): string;
}

/** A resolved item: the native spec plus the shortcut text for the HTML bar. */
export type ResolvedItem =
  | (Extract<MenuItemSpec, { kind: 'action' }> & { shortcut: string })
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: ResolvedItem[] };

export interface ResolvedMenu {
  label: string;
  items: ResolvedItem[];
}

function resolveItems(items: MenuNode[], look: ActionLookup, os: Os): ResolvedItem[] {
  return items.map((n): ResolvedItem => {
    if (n.kind === 'separator') return n;
    if (n.kind === 'submenu') return { ...n, items: resolveItems(n.items, look, os) };
    const chord = look.chord(n.id);
    const shown = look.anyChord(n.id);
    const checked = look.checked(n.id);
    return {
      kind: 'action',
      id: n.id,
      label: n.label ?? look.label(n.id),
      enabled: look.enabled(n.id),
      ...(checked === undefined ? {} : { checked }),
      ...(chord ? { accelerator: chord } : {}),
      shortcut: shown ? formatChord(shown, os) : '',
    };
  });
}

export function resolveMenu(model: TopMenuNode[], look: ActionLookup, os: Os): ResolvedMenu[] {
  return model.map((m) => ({ label: m.label, items: resolveItems(m.items, look, os) }));
}

/** Longest label Rust accepts (`ai-core::menu_spec`). */
const MAX_LABEL = 120;

/** Control characters out, length cut – a file name with a newline must not cost the menu. */
export function menuLabel(text: string): string {
  // eslint-disable-next-line no-control-regex
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim();
  return [...flat].slice(0, MAX_LABEL).join('') || '…';
}

/** The spec Rust gets (the HTML-only `shortcut` stays here). */
export function toSpec(menus: ResolvedMenu[]): MenuSpec {
  const strip = (items: ResolvedItem[]): MenuItemSpec[] =>
    items.map((i) => {
      if (i.kind === 'submenu') {
        return { kind: 'submenu', label: menuLabel(i.label), items: strip(i.items) };
      }
      if (i.kind === 'separator') return i;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { shortcut, ...rest } = i;
      return { ...rest, label: menuLabel(rest.label) };
    });
  return { menus: menus.map((m) => ({ label: menuLabel(m.label), items: strip(m.items) })) };
}

/**
 * The chord the native menu shows for an action: the first one it can take (with a modifier or
 * an F key, `menu_spec::accelerator`), else none. Keys without a modifier (Delete, Escape, Space)
 * would be caught by the menu before the WebView.
 */
export function menuChord(chords: readonly string[]): string {
  return chords.find((c) => /(^|\+)(Mod|Ctrl|Alt)\+/.test(c) || /^F\d{1,2}$/.test(c)) ?? '';
}

/** Items that exclude each other are radio items. */
export function isRadio(id: string): boolean {
  return id.startsWith('view.appearance.') || id.startsWith('view.mask.');
}
