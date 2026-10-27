import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { xml } from '@codemirror/lang-xml';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Diagnostic, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * The CodeMirror 6 editor of "Edit SVG…" (design 011 E1). Only this module imports CodeMirror,
 * and only through `import('./code-editor')` – it is its own lazy chunk, the start bundle stays
 * small. Line numbers, XML highlighting, search (Mod-F), undo of the editor, lint markers set by
 * the dialog. Colours are CSS variables from `styles.css` (light / dark without a rebuild).
 * Mod-Enter applies; Tab is not taken (focus moves on, accessibility).
 */

export interface CodeProblem {
  from: number;
  to: number;
  message: string;
}

export interface CodeEditorOptions {
  text: string;
  label: string;
  onChange(text: string): void;
  onApply(): void;
}

export interface CodeEditorHandle {
  text(): string;
  setText(text: string): void;
  setProblem(problem: CodeProblem | null): void;
  focus(): void;
  destroy(): void;
}

const highlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--code-tag)' },
  { tag: tags.attributeName, color: 'var(--code-attr)' },
  { tag: [tags.attributeValue, tags.string], color: 'var(--code-string)' },
  {
    tag: [tags.comment, tags.processingInstruction, tags.documentMeta],
    color: 'var(--code-comment)',
    fontStyle: 'italic',
  },
  { tag: [tags.punctuation, tags.definitionOperator], color: 'var(--code-punct)' },
  { tag: tags.invalid, color: 'var(--color-error)' },
]);

const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-surface)',
    fontSize: 'var(--font-size-small)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'var(--color-text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--color-selection) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface-2)',
    color: 'var(--color-text-muted)',
    borderRight: '1px solid var(--color-border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--code-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--color-hover)' },
  '.cm-searchMatch': { outline: '1px solid var(--color-accent)' },
  '.cm-panels': {
    backgroundColor: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    borderColor: 'var(--color-border)',
  },
  '.cm-panel input, .cm-panel button': { fontSize: 'var(--font-size-small)' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--color-error)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--color-error)' },
});

export function createCodeEditor(parent: HTMLElement, opts: CodeEditorOptions): CodeEditorHandle {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        bracketMatching(),
        xml(),
        syntaxHighlighting(highlight),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              opts.onApply();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        EditorView.contentAttributes.of({
          'aria-label': opts.label,
          'aria-multiline': 'true',
          'data-testid': 'svg-source-editor',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) opts.onChange(u.state.doc.toString());
        }),
        theme,
      ],
    }),
  });
  return {
    text: () => view.state.doc.toString(),
    setText: (text) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    setProblem: (p) => {
      const len = view.state.doc.length;
      const diagnostics: Diagnostic[] = p
        ? [
            {
              from: Math.min(p.from, len),
              to: Math.min(Math.max(p.to, p.from), len),
              severity: 'error',
              message: p.message,
            },
          ]
        : [];
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
