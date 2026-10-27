import { inject, Injectable } from '@angular/core';
import { checkArgs } from '../../core/actions/action-args';
import { ActionService } from '../../core/actions/action.service';
import { isFsError } from '../../core/errors/fs-error';
import { IconFormat } from '../../core/icon-file/icon-file.models';
import { AskService } from '../../shared/ask/ask.service';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { AddService } from '../commands/add.service';
import { CommandError } from '../document/commands/command';
import { DocumentStore } from '../document/document.store';
import { ExportService } from '../export/export.service';
import { DEFAULT_CHOICE, ExportFormat } from '../export/export-options';
import { FILES_TEXTS } from '../files/files-texts';
import { FilesService } from '../files/files.service';
import { SettingsStore } from '../settings/settings.store';
import { deniedReason } from './mcp-policy';
import {
  assetSvg,
  documentInfo,
  existingRefs,
  mcpError,
  nodeInfo,
  refArg,
  summary,
  treeEntries,
} from './mcp-read';
import { MCP_TEXTS as T } from './mcp-texts';

type Args = Record<string, unknown>;

/** What every write answers (design 018 E9). */
export interface WriteResult {
  revision: number;
  undo: string | null;
  selection: unknown[];
}

const num = (a: Args, k: string, fallback: number) =>
  typeof a[k] === 'number' ? (a[k] as number) : fallback;

/**
 * Runs the tools of the MCP server on this window's document (design 018 E4–E15). Rust has
 * checked the arguments against the schemas and bounded them; here the document rules apply:
 * revision, one undo step per call, the action policy, the user's permission for files.
 * Throws `McpError { code, message }`.
 */
@Injectable({ providedIn: 'root' })
export class McpTools {
  private readonly files = inject(FilesService);
  private readonly actions = inject(ActionService);
  private readonly add = inject(AddService);
  private readonly exporter = inject(ExportService);
  private readonly canvas = inject(CanvasViewStore);
  private readonly settings = inject(SettingsStore);
  private readonly ask = inject(AskService);

  async run(tool: string, args: Args): Promise<unknown> {
    try {
      return await this.dispatch(tool, args);
    } catch (e) {
      if (e instanceof CommandError) throw mcpError('invalid_request', e.message);
      if (isFsError(e)) throw mcpError(e.code, e.message);
      throw e;
    }
  }

  private store(): DocumentStore {
    const s = this.files.store();
    if (!s) throw mcpError('unknown_document', 'this window has no document');
    return s;
  }

  private untitled(): string {
    return FILES_TEXTS.untitled;
  }

  private async dispatch(tool: string, a: Args): Promise<unknown> {
    switch (tool) {
      case 'describe':
        return summary(this.store(), this.untitled());
      case 'open':
        await this.files.openQuietly(String(a['path']));
        return summary(this.store(), this.untitled());
      case 'discard':
        await this.files.close();
        return {};
      case 'get_document':
        return documentInfo(this.store(), this.untitled(), a['icon_json'] !== false);
      case 'get_asset_svg':
        return assetSvg(
          this.store().document(),
          String(a['asset']),
          num(a, 'max_chars', 20_000),
          a['node_ids'] === true,
        );
      case 'get_tree': {
        const s = this.store();
        return { revision: s.revision(), ...treeEntries(s.document(), num(a, 'max_nodes', 500)) };
      }
      case 'get_node':
        return nodeInfo(this.store().document(), refArg(a['node']), this.canvas.host);
      case 'get_selection': {
        const s = this.store();
        return { selection: s.selection(), items: s.items() };
      }
      case 'select': {
        const s = this.store();
        s.select(existingRefs(s.document(), a['nodes']));
        return { selection: s.selection() };
      }
      case 'run_command':
        return this.write(a, (s) => s.runCommand(a['command']));
      case 'run_action':
        return this.runAction(a);
      case 'insert_svg':
        return this.write(a, async () => {
          const place = {
            ...(a['parent'] !== undefined ? { parent: refArg(a['parent']) } : {}),
            ...(typeof a['index'] === 'number' ? { index: a['index'] } : {}),
          };
          const error = await this.add.addSnippet(String(a['markup']), place);
          if (error) throw mcpError('invalid_request', `the markup was not inserted: ${error}`);
        });
      case 'list_actions':
        return {
          actions: this.actions
            .describe()
            .filter((d) => deniedReason(d.id) === null)
            .map(({ id, label, group, enabled, args }) => ({
              id,
              label,
              group,
              enabled,
              ...(args ? { args } : {}),
            })),
        };
      case 'save_document':
        return this.save(a);
      case 'export_png':
      case 'export_svg':
        return this.export(tool === 'export_png' ? 'png' : 'svg', a);
      case 'preview_svg':
        return this.previewSvg(a);
      default:
        throw mcpError('invalid_request', `unknown tool ${tool}`);
    }
  }

  /**
   * A write (design 018 E9/E10): the expected revision first, then everything the call changes
   * as one undo step ("Undo AI: …").
   */
  private async write(a: Args, f: (s: DocumentStore) => unknown): Promise<WriteResult> {
    const s = this.store();
    this.checkRevision(s, a);
    const mark = s.undoMark();
    try {
      await f(s);
    } finally {
      s.groupSince(mark);
    }
    return this.result(s);
  }

  private checkRevision(s: DocumentStore, a: Args): void {
    const expected = a['expected_revision'];
    if (typeof expected === 'number' && expected !== s.revision()) {
      const now = { ...summary(s, this.untitled()), selection: s.selection() };
      throw mcpError(
        'revision_conflict',
        `the document changed: revision ${s.revision()} (expected ${expected}); state: ${JSON.stringify(now)}`,
      );
    }
  }

  private result(s: DocumentStore): WriteResult {
    return { revision: s.revision(), undo: s.undoTitle, selection: [...s.selection()] };
  }

  private async runAction(a: Args): Promise<unknown> {
    const id = String(a['action']);
    const args = a['args'];
    const reason = deniedReason(id, args);
    if (reason) throw mcpError('unavailable', `${id}: ${reason}`);
    const def = this.actions.def(id);
    if (!def) throw mcpError('unavailable', `unknown action ${id} (see list_actions)`);
    if (!checkArgs(def.args, args)) {
      throw mcpError(
        'invalid_request',
        `arguments of ${id} do not fit ${JSON.stringify(def.args ?? 'no arguments')}`,
      );
    }
    // an action may create the first document; then there is no revision to check
    const before = this.files.store();
    if (before) this.checkRevision(before, a);
    const mark = before?.undoMark() ?? 0;
    let ran: boolean;
    try {
      ran = await this.actions.runAsync(id, args);
    } finally {
      // the action may have replaced the document (new): group only on the same store
      if (before && this.files.store() === before) before.groupSince(mark);
    }
    if (!ran) throw mcpError('unavailable', `${id} is not enabled now`);
    const s = this.files.store();
    return {
      ran: true,
      ...(s ? this.result(s) : {}),
      ...(this.files.notice() ? { notice: this.files.notice() } : {}),
    };
  }

  /** The user's permission for a file access of the AI (design 018 E13). */
  private async allowed(message: string): Promise<boolean> {
    if (!this.settings.settings().mcp.confirmFiles) return true;
    const answer = await this.ask.ask({
      title: T.askTitle,
      message,
      buttons: [
        { id: 'deny', label: T.deny },
        { id: 'allow', label: T.allow, primary: true },
      ],
      cancel: 'deny',
    });
    return answer === 'allow';
  }

  private async save(a: Args): Promise<unknown> {
    const s = this.store();
    const path = typeof a['path'] === 'string' ? a['path'] : undefined;
    const format = a['format'] as IconFormat | undefined;
    const own = s.document().path;
    if (path !== undefined && path !== own && !(await this.allowed(T.askSave(path)))) {
      throw mcpError('denied', 'the user did not allow saving there');
    }
    const r = await this.files.saveQuietly(path, format);
    return {
      path: r.path,
      name: r.name,
      format: r.format,
      revision: s.revision(),
      dirty: s.dirty(),
    };
  }

  private async export(format: ExportFormat, a: Args): Promise<unknown> {
    this.store();
    const dir = String(a['dir']);
    if (!(await this.allowed(T.askExport(format.toUpperCase(), dir)))) {
      throw mcpError('denied', 'the user did not allow the export');
    }
    const args: Args = { targetDir: dir };
    for (const k of ['appearances', 'sizes', 'mask', 'effects', 'overwrite']) {
      if (a[k] !== undefined) args[k] = a[k];
    }
    const o = await this.exporter.runAction(format, args);
    switch (o.kind) {
      case 'done':
        return { files: o.report.files, transparentWarning: o.transparentWarning };
      case 'cancelled':
        return { files: o.report.files, cancelled: true };
      case 'exists':
        throw mcpError('already_exists', 'a target file exists – pass overwrite: true');
      case 'noDocument':
        throw mcpError('unknown_document', 'no document');
      case 'noTarget':
        throw mcpError('invalid_path', 'no target folder');
      case 'error':
        throw mcpError('io', o.message);
    }
  }

  /** The export SVG of one appearance for `render_preview` (Rust renders it, design 018 E8). */
  private async previewSvg(a: Args): Promise<unknown> {
    const s = this.store();
    const appearance = a['appearance'] === 'dark' ? 'dark' : 'light';
    const mask =
      (['none', 'squircle', 'circle'] as const).find((m) => m === a['mask']) ?? 'squircle';
    const [v] = await this.exporter.variants(s.document(), {
      ...DEFAULT_CHOICE,
      appearances: [appearance],
      mask,
      effects: false,
    });
    return { svg: v.svg, revision: s.revision() };
  }
}
