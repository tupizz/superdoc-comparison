/**
 * Text Extraction Utilities
 *
 * Functions for extracting text from ProseMirror documents with position mapping.
 */

import type { Node as PMNode } from "prosemirror-model";
import type {
  FormattingSpan,
  PositionMap,
  PositionMapWithFormatting,
  ProseMirrorJsonNode,
  ProseMirrorMark,
  SuperDocEditor,
} from "./types";

/**
 * Block-level node types that should add newlines between content
 */
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
]);

/**
 * Table-related node types that need spacing
 */
const TABLE_TYPES = new Set(["tableCell", "tableRow", "table"]);

/**
 * Extract text from ProseMirror JSON node structure.
 * Used for computing diffs from serialized document data.
 *
 * @param node - The ProseMirror JSON node to extract text from
 * @returns The extracted plain text
 */
export function extractTextFromJson(node: ProseMirrorJsonNode): string {
  if (!node) return "";

  // Text node - return the text content
  if (node.text) return node.text;

  // No content to traverse
  if (!node.content) return "";

  const parts: string[] = [];

  for (const child of node.content) {
    const childType = child.type;

    // Add newline before block elements (except at the start)
    if (BLOCK_TYPES.has(childType) && parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      if (lastPart && !lastPart.endsWith("\n")) {
        parts.push("\n");
      }
    }

    // Add space for table cells/rows to separate content
    if (TABLE_TYPES.has(childType)) {
      const lastPart = parts[parts.length - 1];
      if (lastPart && !lastPart.endsWith(" ") && !lastPart.endsWith("\n")) {
        parts.push(" ");
      }
    }

    // Recursively extract text from child
    parts.push(extractTextFromJson(child));
  }

  return parts.join("");
}

/**
 * Mark types to exclude from formatting comparison (track changes are internal)
 */
const EXCLUDED_MARK_TYPES = new Set([
  "trackInsert",
  "trackDelete",
  "trackFormat",
  "comment",
  "commentMark",
]);

/**
 * Extract text from ProseMirror JSON node structure WITH formatting information.
 * Used for computing formatting diffs from serialized document data.
 *
 * @param node - The ProseMirror JSON node to extract text from
 * @returns Object with extracted text and formatting spans
 */
export function extractTextWithFormattingFromJson(node: ProseMirrorJsonNode): {
  text: string;
  formatting: FormattingSpan[];
} {
  const formatting: FormattingSpan[] = [];
  let charIndex = 0;

  function traverse(n: ProseMirrorJsonNode): string {
    if (!n) return "";

    // Text node - record text and its marks
    if (n.text) {
      const marks = (n.marks || []).filter(
        (m) => !EXCLUDED_MARK_TYPES.has(m.type)
      );

      if (marks.length > 0) {
        formatting.push({
          charStart: charIndex,
          charEnd: charIndex + n.text.length,
          marks,
        });
      }

      charIndex += n.text.length;
      return n.text;
    }

    // No content to traverse
    if (!n.content) return "";

    const parts: string[] = [];

    for (const child of n.content) {
      const childType = child.type;

      // Add newline before block elements (except at the start)
      if (BLOCK_TYPES.has(childType) && parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        if (lastPart && !lastPart.endsWith("\n")) {
          parts.push("\n");
          charIndex += 1;
        }
      }

      // Add space for table cells/rows to separate content
      if (TABLE_TYPES.has(childType)) {
        const lastPart = parts[parts.length - 1];
        if (lastPart && !lastPart.endsWith(" ") && !lastPart.endsWith("\n")) {
          parts.push(" ");
          charIndex += 1;
        }
      }

      // Recursively extract text from child
      parts.push(traverse(child));
    }

    return parts.join("");
  }

  const text = traverse(node);
  return { text, formatting };
}

/**
 * Extract text from a live ProseMirror editor with accurate position mapping.
 * Maps each character index in the extracted text to its ProseMirror position.
 *
 * @param editor - The SuperDoc editor instance
 * @returns Object containing extracted text and character-to-position mapping
 */
export function extractTextWithPositions(editor: SuperDocEditor): PositionMap {
  const doc = editor.state.doc;
  const charToPos: number[] = [];
  let text = "";
  let lastBlockEnd = -1;

  // Traverse all nodes in the document
  doc.descendants((node: PMNode, pos: number) => {
    // Handle text nodes
    if (node.isText && node.text) {
      // Add separator if we're starting a new block
      if (node.isBlock && lastBlockEnd >= 0 && text.length > 0) {
        charToPos.push(pos);
        text += "\n";
      }

      // Map each character to its ProseMirror position
      for (let i = 0; i < node.text.length; i++) {
        charToPos.push(pos + i);
      }
      text += node.text;
    }

    // Track block boundaries
    if (node.isBlock) {
      // Add newline between blocks
      if (lastBlockEnd >= 0 && text.length > 0 && !text.endsWith("\n")) {
        charToPos.push(pos);
        text += "\n";
      }
      lastBlockEnd = pos;
    }

    return true; // Continue traversing
  });

  return { text, charToPos };
}

/**
 * Extract text from a live ProseMirror editor with position mapping AND formatting.
 * This captures both positions and formatting marks for comprehensive comparison.
 *
 * Uses the same extraction logic as extractTextWithPositions for consistency.
 *
 * @param editor - The SuperDoc editor instance
 * @returns Object containing extracted text, position mapping, and formatting spans
 */
export function extractTextWithFormattingFromEditor(
  editor: SuperDocEditor
): PositionMapWithFormatting {
  const doc = editor.state.doc;
  const charToPos: number[] = [];
  const formatting: FormattingSpan[] = [];
  let text = "";

  // Traverse all nodes in the document
  doc.descendants((node: PMNode, pos: number) => {
    // Add newline before block elements (not for the first one)
    if (node.isBlock && text.length > 0 && !text.endsWith("\n")) {
      charToPos.push(pos);
      text += "\n";
    }

    // Handle text nodes
    if (node.isText && node.text) {
      const charStart = text.length;

      // Map each character to its ProseMirror position
      for (let i = 0; i < node.text.length; i++) {
        charToPos.push(pos + i);
      }
      text += node.text;

      // Record formatting marks (excluding track change marks)
      const marks: ProseMirrorMark[] = [];
      for (const mark of node.marks) {
        if (!EXCLUDED_MARK_TYPES.has(mark.type.name)) {
          marks.push({
            type: mark.type.name,
            attrs: mark.attrs as Record<string, unknown> | undefined,
          });
        }
      }

      if (marks.length > 0) {
        formatting.push({
          charStart,
          charEnd: text.length,
          marks,
        });
      }
    }

    return true; // Continue traversing
  });

  return { text, charToPos, formatting };
}

/**
 * Get the ProseMirror position for a character index.
 * Handles edge cases when the exact index isn't mapped.
 *
 * @param posMap - The position map from extractTextWithPositions
 * @param charIndex - The character index to look up
 * @returns The ProseMirror position, or undefined if not found
 */
export function getProseMirrorPosition(
  posMap: PositionMap,
  charIndex: number
): number | undefined {
  // Direct lookup
  if (charIndex >= 0 && charIndex < posMap.charToPos.length) {
    return posMap.charToPos[charIndex];
  }

  // Try previous position if at or past end
  if (charIndex > 0 && charIndex >= posMap.charToPos.length) {
    const lastIndex = posMap.charToPos.length - 1;
    const lastPos = posMap.charToPos[lastIndex];
    if (lastPos !== undefined) {
      return lastPos + (charIndex - lastIndex);
    }
  }

  return undefined;
}

/**
 * Get a range of ProseMirror positions for a character range.
 *
 * @param posMap - The position map from extractTextWithPositions
 * @param charStart - The start character index (inclusive)
 * @param charEnd - The end character index (exclusive)
 * @returns Object with from and to positions, or undefined if mapping fails
 */
export function getProseMirrorRange(
  posMap: PositionMap,
  charStart: number,
  charEnd: number
): { from: number; to: number } | undefined {
  const from = posMap.charToPos[charStart];

  // For the end position, we need the position after the last character
  const lastCharIndex = charEnd - 1;
  const lastCharPos = posMap.charToPos[lastCharIndex];

  if (from === undefined || lastCharPos === undefined) {
    return undefined;
  }

  // The "to" position is one past the last character
  const to = lastCharPos + 1;

  return { from, to };
}

/**
 * Extract context text around a position for search operations.
 *
 * @param text - The full text
 * @param position - The position to get context around
 * @param contextLength - How many characters of context to extract (default 30)
 * @returns The context string, trimmed
 */
export function extractContext(
  text: string,
  position: number,
  contextLength: number = 30
): string {
  const start = Math.max(0, position - contextLength);
  const context = text.substring(start, position);
  return context.trim();
}
