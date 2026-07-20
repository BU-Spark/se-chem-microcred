'use client';

import { useCallback } from 'react';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import type { InitialConfigType } from '@lexical/react/LexicalComposer';

import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { $getRoot, $insertNodes, type EditorState, type LexicalEditor } from 'lexical';

import ToolbarPlugin from './rich-text/ToolbarPlugin';

interface RichTextEditorProps {
  /** Lexical namespace — keep unique if multiple editors share a page. */
  namespace?: string;
  /** Placeholder shown when the editor is empty. */
  placeholder?: string;
  /** Initial content as an HTML string. */
  initialHTML?: string;
  /** Fires on every change with the serialized HTML of the current content. */
  onChange?: (html: string) => void;
  /** Focus the editor on mount. */
  autoFocus?: boolean;
  /** Use the compact inline-format toolbar for question prompts. */
  toolbar?: 'full' | 'inline';
  /** Accessible name for the editable field. */
  ariaLabel?: string;
}

/** Maps Lexical node/format types to the CSS classes defined in globals.css. */
const theme = {
  paragraph: 'rte-paragraph',
  quote: 'rte-quote',
  heading: {
    h1: 'rte-h1',
    h2: 'rte-h2',
    h3: 'rte-h3',
  },
  list: {
    ul: 'rte-ul',
    ol: 'rte-ol',
    listitem: 'rte-li',
    nested: {
      listitem: 'rte-nested-li',
    },
  },
  link: 'rte-link',
  text: {
    bold: 'rte-bold',
    italic: 'rte-italic',
    underline: 'rte-underline',
    strikethrough: 'rte-strikethrough',
    code: 'rte-inline-code',
    subscript: 'rte-subscript',
    superscript: 'rte-superscript',
  },
};

export default function RichTextEditor({
  namespace = 'RichTextEditor',
  placeholder = 'Start writing…',
  initialHTML,
  onChange,
  autoFocus = false,
  toolbar = 'full',
  ariaLabel,
}: RichTextEditorProps) {
  const initialConfig: InitialConfigType = {
    namespace,
    theme,
    onError(error: Error) {
      // Surface errors instead of swallowing them silently.
      console.error('[RichTextEditor]', error);
      throw error;
    },
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
    editorState: initialHTML ? prepopulate(initialHTML) : undefined,
  };

  const handleChange = useCallback(
    (editorState: EditorState, editor: LexicalEditor) => {
      if (!onChange) return;
      editorState.read(() => {
        onChange($generateHtmlFromNodes(editor, null));
      });
    },
    [onChange]
  );

  return (
    <div className={`rte-container${toolbar === 'inline' ? ' rte-container--compact' : ''}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin variant={toolbar} />
        <div className="rte-editor-shell">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="rte-content-editable"
                aria-label={ariaLabel}
                aria-placeholder={placeholder}
                placeholder={<div className="rte-placeholder">{placeholder}</div>}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        {onChange && <OnChangePlugin onChange={handleChange} ignoreSelectionChange />}
        {autoFocus && <AutoFocusPlugin />}
      </LexicalComposer>
    </div>
  );
}

/** Builds an initial editor state from an HTML string. */
function prepopulate(html: string) {
  return (editor: LexicalEditor) => {
    // DOMParser is browser-only; skip during SSR and let the client hydrate it.
    if (typeof window === 'undefined') return;
    const parser = new DOMParser();
    const dom = parser.parseFromString(html, 'text/html');
    const nodes = $generateNodesFromDOM(editor, dom);
    const root = $getRoot();
    root.clear();
    root.select();
    $insertNodes(nodes);
  };
}
