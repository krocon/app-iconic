import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ExportApi } from '../../core/export/export-api';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Appearance, APPEARANCE_LIST } from '../canvas/appearance';
import { CanvasOptions, CanvasViewStore } from '../canvas/canvas-view.store';
import { settledComputed } from '../document/settled';
import { exportSvg, ExportSvgOptions } from '../export/export-svg';
import { rasterSizes } from '../export/export.service';
import { ThumbnailService } from '../start/thumbnail.service';
import { FilesService } from '../files/files.service';
import { IconDocument } from '../document/icon-document';
import {
  IconLook,
  isSceneId,
  SCENE_SCALES,
  SceneId,
  sceneLayout,
  SCENES,
  SceneScale,
  sceneSpec,
} from './mockup-scenes';
import { SceneBackground, sceneSvg, svgDataUrl } from './mockup-svg';
import { MOCKUPS_TEXTS as T } from './mockups-texts';

/** Waiting after a change before the scenes are drawn again (ms; 057 waits 250). */
const DEBOUNCE = 300;

/** One scene as the panel shows it. */
export interface SceneView {
  id: SceneId;
  appearance: Appearance;
  width: number;
  height: number;
  iconSize: number;
  /** Accessible title (`alt`). */
  title: string;
  /** The scene as SVG data URL – `null` until the icon is drawn. */
  url: string | null;
}

/** The export options of a look (design E5): Dock = macOS template, iOS = squircle, Windows = view mask. */
export function lookOptions(look: IconLook, view: CanvasOptions): ExportSvgOptions {
  const common = { effects: view.effects, tint: view.tint };
  switch (look) {
    case 'macos':
      return { ...common, mask: 'none', frame: 'macos' };
    case 'squircle':
      return { ...common, mask: 'squircle' };
    case 'view':
      return { ...common, mask: view.mask };
  }
}

const iconKey = (look: IconLook, a: Appearance) => `${look}:${a}`;

/** The name for labels: the document's name without `.icon`. */
export function iconName(title: string): string {
  return title.replace(/\.icon$/i, '').trim() || title;
}

/**
 * "In Context" (prompt 081): the icon in scenes – Dock, home screens, Spotlight/notification,
 * taskbar – each in its appearance, drawn from the export SVG (as 057) a moment after a change and
 * never during a gesture (`settledComputed`); copy or save a scene as PNG (Rust renders, as
 * `file.copyPng` of 078). Session state: appearances per scene, scale, background image.
 */
@Injectable({ providedIn: 'root' })
export class MockupsService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly exporter = inject(ExportApi);
  private readonly iconFiles = inject(IconFileApi);
  private readonly dialogs = inject(DialogService);
  private readonly thumbnails = inject(ThumbnailService);

  /** The panel is open. */
  readonly visible = computed(() => this.dialogs.open() === 'mockups');
  readonly appearances = signal<Readonly<Record<SceneId, Appearance>>>(
    Object.fromEntries(SCENES.map((s) => [s.id, s.appearance])) as Record<SceneId, Appearance>,
  );
  /** Scale of copied/saved PNGs. */
  readonly scale = signal<SceneScale>(2);
  /** The scene actions without `scene` work on (the last one used in the panel). */
  readonly current = signal<SceneId>('dock');
  readonly background = signal<SceneBackground | null>(null);
  /** Icon data URLs per look and appearance (drawn while the panel is open). */
  private readonly icons = signal<ReadonlyMap<string, string>>(new Map());
  /** Previews of the recently used icons for the placeholder slots (prompt 082 E10). */
  private readonly neighbours = signal<readonly string[]>([]);
  private readonly settled = settledComputed(
    () => this.files.store(),
    () => this.files.store()?.revision(),
  );
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  readonly name = computed(() => iconName(this.files.title()));

  readonly scenes = computed<SceneView[]>(() => {
    const icons = this.icons();
    const appearances = this.appearances();
    const background = this.background();
    const name = this.name();
    const neighbours = this.neighbours();
    return SCENES.map((spec) => {
      const appearance = appearances[spec.id];
      const icon = icons.get(iconKey(spec.look, appearance)) ?? null;
      const title = this.title(spec.id, appearance, name);
      return {
        id: spec.id,
        appearance,
        width: spec.width,
        height: spec.height,
        iconSize: spec.iconSize,
        title,
        url: icon
          ? svgDataUrl(
              sceneSvg({
                layout: sceneLayout(spec.id),
                appearance,
                icon,
                name,
                background,
                title,
                neighbours,
              }),
            )
          : null,
      };
    });
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      this.settled();
      const store = this.files.store();
      const view = this.view.options();
      const appearances = this.appearances();
      untracked(() => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(
          () => void this.draw(store?.document() ?? null, view, appearances),
          DEBOUNCE,
        );
      });
    });
  }

  private title(id: SceneId, appearance: Appearance, name: string): string {
    return T.sceneTitle(T.scenes[id], T.appearances[appearance], name);
  }

  private async draw(
    doc: IconDocument | null,
    view: CanvasOptions,
    appearances: Readonly<Record<SceneId, Appearance>>,
  ): Promise<void> {
    const seq = ++this.seq;
    if (!doc) {
      this.icons.set(new Map());
      return;
    }
    const raster = await rasterSizes(doc);
    const neighbours = await this.thumbnails.neighbours(doc.path);
    if (seq !== this.seq) return;
    this.neighbours.set(neighbours);
    const icons = new Map<string, string>();
    for (const spec of SCENES) {
      const a = appearances[spec.id];
      const key = iconKey(spec.look, a);
      if (!icons.has(key)) {
        icons.set(key, svgDataUrl(exportSvg(doc, a, lookOptions(spec.look, view), raster)));
      }
    }
    this.icons.set(icons);
  }

  setAppearance(scene: unknown, appearance: unknown): boolean {
    if (!isSceneId(scene) || !APPEARANCE_LIST.includes(appearance as Appearance)) return false;
    this.appearances.update((m) => ({ ...m, [scene]: appearance as Appearance }));
    this.current.set(scene);
    return true;
  }

  /** The scene's SVG for the PNG, built now (works without the open panel, e.g. for the AI). */
  async sceneSvgNow(id: SceneId): Promise<string | null> {
    const store = this.files.store();
    if (!store) return null;
    const doc = store.document();
    const spec = sceneSpec(id);
    const appearance = this.appearances()[id];
    const icon = exportSvg(
      doc,
      appearance,
      lookOptions(spec.look, this.view.options()),
      await rasterSizes(doc),
    );
    const name = this.name();
    return sceneSvg({
      layout: sceneLayout(id),
      appearance,
      icon: svgDataUrl(icon),
      name,
      background: this.background(),
      title: this.title(id, appearance, name),
      neighbours: await this.thumbnails.neighbours(doc.path),
    });
  }

  private target(args: {
    scene?: unknown;
    scale?: unknown;
  }): { id: SceneId; scale: SceneScale } | null {
    const id = args.scene ?? this.current();
    const scale = args.scale ?? this.scale();
    if (!isSceneId(id) || !SCENE_SCALES.includes(scale as SceneScale)) return null;
    return { id, scale: scale as SceneScale };
  }

  /** `mockups.copyPng { scene?, scale? }`. */
  copyPng(args: { scene?: unknown; scale?: unknown } = {}): Promise<boolean> {
    return this.render(args, async (svg, t) => {
      await this.exporter.copyScenePng(svg, t.scale);
      return T.copied(T.scenes[t.id]);
    });
  }

  /** `mockups.savePng { scene?, scale? }`: save dialog (Rust), then the PNG. */
  savePng(args: { scene?: unknown; scale?: unknown } = {}): Promise<boolean> {
    return this.render(args, async (svg, t) => {
      const path = await this.exporter.saveScenePng(
        svg,
        t.scale,
        `${this.name()} – ${T.scenes[t.id]}`,
      );
      return path === null ? null : T.saved(T.scenes[t.id]);
    });
  }

  private async render(
    args: { scene?: unknown; scale?: unknown },
    f: (svg: string, t: { id: SceneId; scale: SceneScale }) => Promise<string | null>,
  ): Promise<boolean> {
    const t = this.target(args);
    if (!t) {
      this.files.notice.set(T.failed(T.badArguments));
      return false;
    }
    try {
      const svg = await this.sceneSvgNow(t.id);
      if (!svg) {
        this.files.notice.set(T.noDocument);
        return false;
      }
      const notice = await f(svg, t);
      if (notice === null) return false;
      this.current.set(t.id);
      this.files.notice.set(notice);
      return true;
    } catch (e) {
      this.files.notice.set(T.failed(describeFsError(toFsError(e))));
      return false;
    }
  }

  /** `mockups.background`: an own image through the open dialog (Rust checks path and size). */
  async pickBackground(): Promise<boolean> {
    try {
      const path = await this.iconFiles.pickImageFile();
      if (!path) return false;
      const file = await this.iconFiles.readImageFile(path);
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(file.dataUrl)) {
        this.files.notice.set(T.backgroundSvg);
        return false;
      }
      this.background.set({ dataUrl: file.dataUrl });
      return true;
    } catch (e) {
      this.files.notice.set(T.backgroundFailed(describeFsError(toFsError(e))));
      return false;
    }
  }

  clearBackground(): void {
    this.background.set(null);
  }

  toggle(): void {
    if (this.visible()) this.dialogs.close();
    else this.dialogs.show('mockups');
  }
}
