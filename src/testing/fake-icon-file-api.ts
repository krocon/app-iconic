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
  SvgFile,
} from '../app/core/icon-file/icon-file.models';
import { FsError } from '../app/core/errors/fs-error';
import { CAMSCANNER_ICON } from './fixtures/camscanner-icon';
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

  /** "Disk": path → file. */
  readonly files = new Map<string, FakeIconFile>();
  /** SVG files for `readSvgFile`. */
  readonly svgFiles = new Map<string, SvgFile>();
  /** Answers of the next dialogs, in order; empty = cancelled. */
  readonly picks: (string | null)[] = [];
  /** Every save request, in order. */
  readonly saved: SaveIconRequest[] = [];
  /** The next call fails with this error. */
  failNext: FsError | null = null;

  private readonly sessions = new Map<string, FakeIconFile>();

  constructor() {
    super();
    this.files.set(FakeIconFileApi.CAMSCANNER, fromFixture(CAMSCANNER_ICON));
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
    const base = this.sessions.get(r.from ?? r.path);
    const seen = new Set<string>();
    const assets = r.assets.map((a): IconAssetDto => {
      const key = a.name.normalize('NFC').toLowerCase();
      if (!a.name || a.name.startsWith('.') || /[/\\:]/.test(a.name) || seen.has(key)) {
        throw error('invalid_path', `invalid or duplicate asset name ${a.name}`, r.path);
      }
      seen.add(key);
      if (a.unchanged) {
        const old = base?.assets.find((b) => b.name === a.name);
        if (!old) throw error('missing_asset', `unknown asset ${a.name}`, r.path);
        return { ...old };
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
    const file: FakeIconFile = { format: r.format, iconJson, assets };
    this.files.set(r.path, file);
    this.sessions.set(r.path, file);
    return { path: r.path, format: r.format };
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

  async pickOpenIcon(): Promise<string | null> {
    this.fail();
    return this.picks.shift() ?? null;
  }

  async pickSaveIcon(): Promise<string | null> {
    this.fail();
    return this.picks.shift() ?? null;
  }

  async pickSvgFile(): Promise<string | null> {
    this.fail();
    return this.picks.shift() ?? null;
  }
}
