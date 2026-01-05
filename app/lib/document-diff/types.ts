/**
 * Document Diff Types
 *
 * This module provides TypeScript types for document comparison operations.
 * Uses actual ProseMirror types for proper type safety.
 */

import type { EditorView } from "prosemirror-view";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Schema, Node as PMNode, Mark as PMMark, ResolvedPos } from "prosemirror-model";

// =============================================================================
// Re-export ProseMirror types for convenience
// =============================================================================

export type {
  EditorView,
  EditorState,
  Transaction,
  Schema,
  PMNode,
  PMMark,
  ResolvedPos,
};

// =============================================================================
// ProseMirror JSON Types (serialized representation)
// =============================================================================

/**
 * ProseMirror mark attributes
 */
export interface ProseMirrorMarkAttrs {
  readonly id?: string;
  readonly author?: string;
  readonly authorEmail?: string;
  readonly authorImage?: string;
  readonly date?: string;
  readonly color?: string;
  [key: string]: unknown;
}

/**
 * ProseMirror mark (JSON serialized)
 */
export interface ProseMirrorMark {
  readonly type: string;
  readonly attrs?: ProseMirrorMarkAttrs;
}

/**
 * ProseMirror node attributes
 */
export interface ProseMirrorNodeAttrs {
  readonly level?: number;
  readonly start?: number;
  readonly colspan?: number;
  readonly rowspan?: number;
  [key: string]: unknown;
}

/**
 * ProseMirror JSON node structure (from editor.getJSON())
 */
export interface ProseMirrorJsonNode {
  readonly type: string;
  readonly content?: ReadonlyArray<ProseMirrorJsonNode>;
  readonly text?: string;
  readonly marks?: ReadonlyArray<ProseMirrorMark>;
  readonly attrs?: ProseMirrorNodeAttrs;
}

// =============================================================================
// SuperDoc Editor Interface
// =============================================================================

/**
 * Search result from editor search command
 */
export interface SearchResult {
  readonly from: number;
  readonly to: number;
}

/**
 * SuperDoc/TipTap editor commands interface
 */
export interface SuperDocCommands {
  search(text: string, options?: { highlight?: boolean }): SearchResult[] | null;
  [key: string]: unknown;
}

/**
 * SuperDoc/TipTap chainable commands
 */
export interface SuperDocChain {
  setTextSelection(range: { from: number; to: number }): SuperDocChain;
  scrollIntoView(): SuperDocChain;
  run(): void;
}

/**
 * SuperDoc Editor interface - matches the actual SuperDoc Editor class
 * This uses real ProseMirror types for proper type safety
 */
export interface SuperDocEditor {
  /** ProseMirror view */
  readonly view: EditorView;
  /** Current editor state */
  readonly state: EditorState;
  /** ProseMirror schema */
  readonly schema: Schema;
  /** Get document as JSON */
  getJSON(): ProseMirrorJsonNode;
  /** Get document as HTML */
  getHTML(): string;
  /** Editor commands */
  commands: SuperDocCommands;
  /** Create command chain */
  chain(): SuperDocChain;
}

// =============================================================================
// Diff Types
// =============================================================================

/**
 * Type of change detected in document comparison
 */
export type ChangeType = "insertion" | "deletion" | "replacement";

/**
 * Base change information
 */
export interface Change {
  readonly id: string;
  readonly type: ChangeType;
  readonly content: string;
  readonly oldContent?: string;
}

/**
 * Change with position information for applying to document
 */
export interface ChangeWithPosition extends Change {
  /** Character start position in modified text (for insertions/replacements) */
  readonly charStart?: number;
  /** Character end position in modified text (for insertions/replacements) */
  readonly charEnd?: number;
  /** Position in modified text where deleted content should be inserted */
  readonly insertAt?: number;
  /** Text context before the deletion (for finding insertion point) */
  readonly contextBefore?: string;
}

/**
 * Mapping from character index to ProseMirror position
 */
export interface PositionMap {
  /** Extracted text from the document */
  readonly text: string;
  /** Maps character index in extracted text to ProseMirror position */
  readonly charToPos: ReadonlyArray<number>;
}

/**
 * Summary of changes in a comparison
 */
export interface DiffSummary {
  readonly insertions: number;
  readonly deletions: number;
  readonly replacements: number;
}

// =============================================================================
// Track Changes Types
// =============================================================================

/**
 * User information for track changes attribution
 */
export interface TrackChangeUser {
  readonly name: string;
  readonly email: string;
  readonly image?: string;
}

/**
 * Modification to apply to the document
 */
export interface DocumentModification {
  readonly change: ChangeWithPosition;
  readonly pmFrom: number;
  readonly pmTo: number;
  readonly isDeletion?: boolean;
  /** Range of context text for getting formatting marks */
  readonly contextRange?: { readonly from: number; readonly to: number };
}

/**
 * Result of applying track changes
 */
export interface TrackChangesResult {
  readonly successCount: number;
  readonly totalCount: number;
  readonly errors: ReadonlyArray<string>;
}

// =============================================================================
// Component Props Types
// =============================================================================

/**
 * Props for DocumentComparison component
 */
export interface DocumentComparisonProps {
  readonly originalBase64: string;
  readonly modifiedBase64: string;
  readonly originalName: string;
  readonly modifiedName: string;
}
