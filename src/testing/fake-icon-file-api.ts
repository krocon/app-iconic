import { Injectable } from '@angular/core';
import { findAsset, imageNames } from '../app/core/icon-file/asset-names';
import { IconFileApi } from '../app/core/icon-file/icon-file-api';
import {
  IconAssetDto,
  IconDocumentDto,
  IconFormat,
  IconJson,
  IconWarning,
  SaveIconRequest,
  SaveResult,
  ImageFileDto,
  SvgFile,
} from '../app/core/icon-file/icon-file.models';
import { FsError } from '../app/core/errors/fs-error';
import { CAMSCANNER_ICON } from './fixtures/camscanner-icon';
import { ALL_FIELDS_ICON } from './fixtures/all-fields-icon';
import { FixtureIcon } from './fixtures/fixture-icon';

/** A `.icon` file in the fake's memory. */
export interface FakeIconFile {
  format: IconFormat;
  /** `icon.json` text as "on disk". */
  iconJson: string;
  assets: IconAssetDto[];
}

/** Mirror of Rust `icon::new_icon()` (design 002 E13). */
const NEW_ICON: IconJson = {
  fill: 'automatic',
  groups: [
    {
      layers: [{ 'image-name': 'layer.svg', name: 'layer' }],
      shadow: { kind: 'neutral', opacity: 0.5 },
      translucency: { enabled: true, value: 0.5 },
    },
  ],
  'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
};
const EMPTY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n</svg>\n';

function fromFixture(f: FixtureIcon): FakeIconFile {
  return {
    format: 'bundle',
    iconJson: f.iconJson,
    assets: f.assets.map((a) => ({ name: a.name, kind: 'svg', text: a.text })),
  };
}

/** Last path component – fine in a fake (the app itself never splits paths). */
export function fakeName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

function error(code: FsError['code'], message: string, path?: string): FsError {
  return { code, message, path: path ?? null };
}

/** Order-insensitive deep equality of JSON values (like `serde_json::Value ==`). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      k in b && jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Test double of {@link IconFileApi} with in-memory files (prompt 002), preloaded with the
 * fixture `camscanner.icon` at {@link FakeIconFileApi.CAMSCANNER}. Mirrors the backend's rules:
 * sessions per path, unchanged assets from the session, unchanged `icon.json` written as read.
 * Never imported by app code.
 */
@Injectable()
export class FakeIconFileApi extends IconFileApi {
  static readonly CAMSCANNER = '/fixtures/camscanner.icon';
  /** `testdata/fixtures/all-fields.icon` (design 010 E11; export contact sheet, 012). */
  static readonly ALL_FIELDS = '/fixtures/all-fields.icon';

  /** "Disk": path → file. */
  readonly files = new Map<string, FakeIconFile>();
  /** SVG files for `readSvgFile`. */
  readonly svgFiles = new Map<string, SvgFile>();
  /** Images for `readImageFile` (design 008 E8). */
  readonly imageFiles = new Map<string, ImageFileDto>();
  /** Answers of the next dialogs, in order; empty = cancelled. */
  readonly picks: (string | null)[] = [];
  /** Every save request, in order. */
  readonly saved: SaveIconRequest[] = [];
  /** The next call fails with this error. */
  failNext: FsError | null = null;
  /**
   * Answer of a dialog when `picks` is empty (default: cancelled). The browser mode sets it so
   * that `pnpm start` can be used by hand (design 003 E14).
   */
  fallbackPick:
    ((kind: 'open' | 'save' | 'svg' | 'image', suggestedName?: string) => string | null) | null =
    null;

  private readonly sessions = new Map<string, FakeIconFile>();

  constructor() {
    super();
    this.files.set(FakeIconFileApi.CAMSCANNER, fromFixture(CAMSCANNER_ICON));
    this.files.set(FakeIconFileApi.ALL_FIELDS, fromFixture(ALL_FIELDS_ICON));
  }

  /** Puts a one-layer `.icon` with the SVG `text` at `path` (browser mode: every SVG fixture). */
  addSvgIcon(path: string, assetName: string, text: string): void {
    const layer = assetName.replace(/\.svg$/i, '');
    const iconJson: IconJson = {
      ...NEW_ICON,
      groups: [{ ...NEW_ICON.groups![0], layers: [{ 'image-name': assetName, name: layer }] }],
    };
    this.files.set(path, {
      format: 'bundle',
      iconJson: JSON.stringify(iconJson, null, 2),
      assets: [{ name: assetName, kind: 'svg', text }],
    });
  }

  private fail(): void {
    const e = this.failNext;
    this.failNext = null;
    if (e) throw e;
  }

  private toDto(path: string | null, f: FakeIconFile): IconDocumentDto {
    const iconJson = JSON.parse(f.iconJson) as IconJson;
    const warnings: IconWarning[] = imageNames(iconJson)
      .filter((n) => !findAsset(f.assets, n))
      .map((name) => ({ code: 'missing_asset', name }));
    return {
      path,
      name: path === null ? null : fakeName(path),
      format: f.format,
      iconJson,
      assets: f.assets.map((a) => ({ ...a })),
      warnings,
    };
  }

  async openIcon(path: string): Promise<IconDocumentDto> {
    this.fail();
    const f = this.files.get(path);
    if (!f) throw error('not_found', 'no such file', path);
    try {
      JSON.parse(f.iconJson);
    } catch {
      throw error('invalid_icon', 'icon.json is broken', path);
    }
    this.sessions.set(path, f);
    return this.toDto(path, f);
  }

  async newIcon(): Promise<IconDocumentDto> {
    this.fail();
    return this.toDto(null, {
      format: 'bundle',
      iconJson: JSON.stringify(NEW_ICON, null, 2),
      assets: [{ name: 'layer.svg', kind: 'svg', text: EMPTY_SVG }],
    });
  }

  async saveIcon(r: SaveIconRequest): Promise<SaveResult> {
    this.fail();
    this.saved.push(structuredClone(r));
    const file = this.assemble(r);
    this.files.set(r.path, file);
    this.sessions.set(r.path, file);
    return { path: r.path, name: fakeName(r.path), format: r.format };
  }

  /**
   * The file a save request describes (Rust `assemble`): unchanged assets from the session of
   * `from` / `path`. Also the recovery fake (prompt 083) – `path` may be empty there.
   */
  assemble(r: SaveIconRequest): FakeIconFile {
    const base = this.sessions.get(r.from ?? r.path);
    const seen = new Set<string>();
    const assets = r.assets.map((a): IconAssetDto => {
      const key = a.name.normalize('NFC').toLowerCase();
      if (!a.name || a.name.startsWith('.') || /[/\\:]/.test(a.name) || seen.has(key)) {
        throw error('invalid_path', `invalid or duplicate asset name ${a.name}`, r.path);
      }
      seen.add(key);
      if (a.unchanged) {
        const from = a.source ?? a.name;
        const old = base?.assets.find((b) => b.name === from);
        if (!old) throw error('missing_asset', `unknown asset ${from}`, r.path);
        return { ...old, name: a.name };
      }
      // a new / replaced PNG (prompt 080 E6): like Rust, only PNG data URLs for `.png` assets
      if (a.text === undefined && a.dataUrl !== undefined) {
        if (!/\.png$/i.test(a.name) || !a.dataUrl.startsWith('data:image/png;base64,')) {
          throw error('invalid_icon', `no content for ${a.name}`, r.path);
        }
        return { name: a.name, kind: 'png', dataUrl: a.dataUrl };
      }
      if (a.text === undefined) throw error('invalid_icon', `no content for ${a.name}`, r.path);
      return {
        name: a.name,
        kind: a.name.toLowerCase().endsWith('.svg') ? 'svg' : 'other',
        text: a.text,
      };
    });
    const iconJson =
      base && jsonEqual(JSON.parse(base.iconJson), r.iconJson)
        ? base.iconJson
        : JSON.stringify(r.iconJson, null, 2);
    return { format: r.format, iconJson, assets };
  }

  /** Keeps `file` as the session of `path` unless there is one (restored snapshot, 083). */
  adoptSession(path: string, file: FakeIconFile): void {
    if (!this.sessions.has(path)) this.sessions.set(path, file);
  }

  async closeIcon(path: string): Promise<void> {
    this.fail();
    this.sessions.delete(path);
  }

  async readSvgFile(path: string): Promise<SvgFile> {
    this.fail();
    const f = this.svgFiles.get(path);
    if (!f) throw error('not_found', 'no such file', path);
    return { ...f };
  }

  private pick(kind: 'open' | 'save' | 'svg' | 'image', suggestedName?: string): string | null {
    this.fail();
    if (this.picks.length) return this.picks.shift() ?? null;
    return this.fallbackPick?.(kind, suggestedName) ?? null;
  }

  async pickOpenIcon(): Promise<string | null> {
    return this.pick('open');
  }

  async pickSaveIcon(suggestedName?: string): Promise<string | null> {
    return this.pick('save', suggestedName);
  }

  async pickSvgFile(): Promise<string | null> {
    return this.pick('svg');
  }

  async pickImageFile(): Promise<string | null> {
    return this.pick('image');
  }

  async readImageFile(path: string): Promise<ImageFileDto> {
    this.fail();
    const f = this.imageFiles.get(path);
    if (!f) throw error('not_found', 'no such file', path);
    return { ...f };
  }
}
