'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@iconify/react';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import {
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type TextFormatType,
} from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { $createParagraphNode } from 'lexical';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list';
import { $isListNode, ListNode } from '@lexical/list';
import { $getNearestNodeOfType } from '@lexical/utils';
import { $isHeadingNode } from '@lexical/rich-text';
import { $isRootOrShadowRoot } from 'lexical';
import { $findMatchingParent } from '@lexical/utils';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $isLinkNode } from '@lexical/link';

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number';

export default function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>('paragraph');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    setIsBold(selection.hasFormat('bold'));
    setIsItalic(selection.hasFormat('italic'));
    setIsUnderline(selection.hasFormat('underline'));
    setIsStrikethrough(selection.hasFormat('strikethrough'));

    // Detect if the selection sits inside a link
    const node = selection.anchor.getNode();
    const parent = node.getParent();
    setIsLink($isLinkNode(parent) || $isLinkNode(node));

    // Figure out the current block type
    const anchorNode = selection.anchor.getNode();
    let element =
      anchorNode.getKey() === 'root'
        ? anchorNode
        : $findMatchingParent(anchorNode, (e) => {
            const parentNode = e.getParent();
            return parentNode !== null && $isRootOrShadowRoot(parentNode);
          });

    if (element === null) {
      element = anchorNode.getTopLevelElementOrThrow();
    }

    if ($isListNode(element)) {
      const parentList = $getNearestNodeOfType<ListNode>(anchorNode, ListNode);
      const type = parentList ? parentList.getListType() : element.getListType();
      setBlockType(type === 'number' ? 'number' : 'bullet');
    } else if ($isHeadingNode(element)) {
      setBlockType(element.getTag() as BlockType);
    } else {
      const type = element.getType();
      setBlockType(type === 'quote' ? 'quote' : 'paragraph');
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => updateToolbar());
    });
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatBlock = (type: 'paragraph' | 'quote' | HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (type === 'paragraph') {
        $setBlocksType(selection, () => $createParagraphNode());
      } else if (type === 'quote') {
        $setBlocksType(selection, () => $createQuoteNode());
      } else {
        $setBlocksType(selection, () => $createHeadingNode(type));
      }
    });
  };

  const toggleBulletList = () => {
    if (blockType !== 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const toggleNumberList = () => {
    if (blockType !== 'number') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const insertLink = useCallback(() => {
    if (!isLink) {
      const url = window.prompt('Enter URL');
      if (url) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
      }
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [editor, isLink]);

  return (
    <div className="rte-toolbar" role="toolbar" aria-label="Formatting options">
      <button
        type="button"
        className="rte-toolbar-btn"
        disabled={!canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        aria-label="Undo"
        title="Undo"
      >
        <Icon icon="lucide:undo-2" width={18} height={18} />
      </button>
      <button
        type="button"
        className="rte-toolbar-btn"
        disabled={!canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        aria-label="Redo"
        title="Redo"
      >
        <Icon icon="lucide:redo-2" width={18} height={18} />
      </button>

      <span className="rte-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className={`rte-toolbar-btn${isBold ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatText('bold')}
        aria-label="Bold"
        aria-pressed={isBold}
        title="Bold"
      >
        <Icon icon="lucide:bold" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${isItalic ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatText('italic')}
        aria-label="Italic"
        aria-pressed={isItalic}
        title="Italic"
      >
        <Icon icon="lucide:italic" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${isUnderline ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatText('underline')}
        aria-label="Underline"
        aria-pressed={isUnderline}
        title="Underline"
      >
        <Icon icon="lucide:underline" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${isStrikethrough ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatText('strikethrough')}
        aria-label="Strikethrough"
        aria-pressed={isStrikethrough}
        title="Strikethrough"
      >
        <Icon icon="lucide:strikethrough" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${isLink ? ' rte-toolbar-btn--active' : ''}`}
        onClick={insertLink}
        aria-label="Insert link"
        aria-pressed={isLink}
        title="Insert link"
      >
        <Icon icon="lucide:link" width={18} height={18} />
      </button>

      <span className="rte-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className={`rte-toolbar-btn${blockType === 'h1' ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatBlock('h1')}
        aria-label="Heading 1"
        aria-pressed={blockType === 'h1'}
        title="Heading 1"
      >
        <Icon icon="lucide:heading-1" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${blockType === 'h2' ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatBlock('h2')}
        aria-label="Heading 2"
        aria-pressed={blockType === 'h2'}
        title="Heading 2"
      >
        <Icon icon="lucide:heading-2" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${blockType === 'h3' ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatBlock('h3')}
        aria-label="Heading 3"
        aria-pressed={blockType === 'h3'}
        title="Heading 3"
      >
        <Icon icon="lucide:heading-3" width={18} height={18} />
      </button>

      <span className="rte-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className={`rte-toolbar-btn${blockType === 'bullet' ? ' rte-toolbar-btn--active' : ''}`}
        onClick={toggleBulletList}
        aria-label="Bulleted list"
        aria-pressed={blockType === 'bullet'}
        title="Bulleted list"
      >
        <Icon icon="lucide:list" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${blockType === 'number' ? ' rte-toolbar-btn--active' : ''}`}
        onClick={toggleNumberList}
        aria-label="Numbered list"
        aria-pressed={blockType === 'number'}
        title="Numbered list"
      >
        <Icon icon="lucide:list-ordered" width={18} height={18} />
      </button>
      <button
        type="button"
        className={`rte-toolbar-btn${blockType === 'quote' ? ' rte-toolbar-btn--active' : ''}`}
        onClick={() => formatBlock('quote')}
        aria-label="Quote"
        aria-pressed={blockType === 'quote'}
        title="Quote"
      >
        <Icon icon="lucide:quote" width={18} height={18} />
      </button>
    </div>
  );
}
