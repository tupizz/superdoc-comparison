/**
 * Document Diff Utilities
 *
 * This module provides utilities for comparing and highlighting differences
 * between documents using ProseMirror/SuperDoc track changes.
 *
 * @example
 * ```typescript
 * import {
 *   extractTextFromJson,
 *   extractTextWithPositions,
 *   computeChangesWithPositions,
 *   applyTrackChanges,
 * } from "@/app/lib/document-diff";
 *
 * // Extract text from both documents
 * const originalText = extractTextFromJson(originalJson);
 * const posMap = extractTextWithPositions(modifiedEditor);
 *
 * // Compute changes
 * const changes = computeChangesWithPositions(originalText, posMap.text);
 *
 * // Apply track changes to the document
 * const result = applyTrackChanges(modifiedEditor, changes, posMap);
 * ```
 */

// Types - ProseMirror
export type {
  EditorView,
  EditorState,
  Transaction,
  Schema,
  PMNode,
  PMMark,
  ResolvedPos,
} from "./types";

// Types - JSON serialized
export type {
  ProseMirrorJsonNode,
  ProseMirrorMark,
  ProseMirrorMarkAttrs,
  ProseMirrorNodeAttrs,
} from "./types";

// Types - SuperDoc Editor
export type {
  SuperDocEditor,
  SuperDocCommands,
  SuperDocChain,
  SearchResult,
} from "./types";

// Types - Diff
export type {
  Change,
  ChangeType,
  ChangeWithPosition,
  DiffSummary,
  PositionMap,
  PositionMapWithFormatting,
} from "./types";

// Types - Formatting
export type {
  FormattingChange,
  FormattingChangeType,
  FormattingChangeWithPosition,
  FormattingSpan,
} from "./types";

// Types - Track changes
export type {
  DocumentModification,
  TrackChangeUser,
  TrackChangesResult,
} from "./types";

// Types - Component props
export type { DocumentComparisonProps } from "./types";

// Text extraction utilities
export {
  extractContext,
  extractTextFromJson,
  extractTextWithFormattingFromEditor,
  extractTextWithFormattingFromJson,
  extractTextWithPositions,
  getProseMirrorPosition,
  getProseMirrorRange,
} from "./text-extraction";

// Diff computation utilities
export {
  computeChangesWithPositions,
  computeDiffSummary,
  computeFormattingChanges,
  filterChangesByType,
  getDeletionSearchContext,
  getMarkTypeLabel,
  hasSufficientContext,
  sortChangesForApplication,
} from "./diff-computation";

// Track changes utilities
export {
  addCommentsToChanges,
  applyFormattingTrackChanges,
  applyTrackChanges,
  approveChange,
  buildModifications,
  COMPARISON_USER,
  createTrackDeleteMark,
  createTrackInsertMark,
  getFormattingMarks,
  navigateToChange,
  navigateToFormattingChange,
  rejectChange,
  sortModificationsForApplication,
} from "./track-changes";
