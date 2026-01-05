/**
 * Track Changes Application Utilities
 *
 * Functions for applying track change marks (insertions, deletions) to ProseMirror documents.
 */

import type { Node as PMNode, Mark as PMMark, MarkType, Schema } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import type {
  ChangeWithPosition,
  DocumentModification,
  PositionMap,
  SuperDocEditor,
  TrackChangeUser,
  TrackChangesResult,
} from "./types";
import { getDeletionSearchContext, hasSufficientContext } from "./diff-computation";

/**
 * Track change mark names in SuperDoc schema
 */
const TRACK_MARK_NAMES = ["trackInsert", "trackDelete", "trackFormat"] as const;

/**
 * Default user for comparison track changes
 */
export const COMPARISON_USER: TrackChangeUser = {
  name: "Comparison",
  email: "comparison@superdoc.diff",
  image: "",
};

/**
 * Build modifications list with ProseMirror positions from character positions.
 * Maps changes to document positions for application.
 *
 * @param editor - The editor instance
 * @param changes - Changes to map
 * @param posMap - Position mapping from text extraction
 * @returns Array of modifications with ProseMirror positions
 */
export function buildModifications(
  editor: SuperDocEditor,
  changes: ChangeWithPosition[],
  posMap: PositionMap
): DocumentModification[] {
  const modifications: DocumentModification[] = [];

  for (const change of changes) {
    const modification = mapChangeToModification(editor, change, posMap);
    if (modification) {
      modifications.push(modification);
    }
  }

  return modifications;
}

/**
 * Map a single change to a document modification
 */
function mapChangeToModification(
  editor: SuperDocEditor,
  change: ChangeWithPosition,
  posMap: PositionMap
): DocumentModification | null {
  // Handle insertions and replacements (have char positions in modified text)
  if (
    (change.type === "insertion" || change.type === "replacement") &&
    change.charStart !== undefined &&
    change.charEnd !== undefined
  ) {
    return mapInsertionOrReplacement(change, posMap);
  }

  // Handle deletions (need context search for positioning)
  if (change.type === "deletion") {
    return mapDeletion(editor, change, posMap);
  }

  return null;
}

/**
 * Map an insertion or replacement change to positions
 */
function mapInsertionOrReplacement(
  change: ChangeWithPosition,
  posMap: PositionMap
): DocumentModification | null {
  const pmFrom = posMap.charToPos[change.charStart!];
  const pmTo = posMap.charToPos[change.charEnd! - 1];

  if (pmFrom === undefined || pmTo === undefined) {
    console.warn(`Position mapping failed for "${change.content.substring(0, 30)}..."`);
    return null;
  }

  return {
    change,
    pmFrom,
    pmTo: pmTo + 1, // End position is exclusive
  };
}

/**
 * Map a deletion change to an insertion position using context search
 */
function mapDeletion(
  editor: SuperDocEditor,
  change: ChangeWithPosition,
  posMap: PositionMap
): DocumentModification | null {
  // Try context-based search first (more reliable for inline positioning)
  if (hasSufficientContext(change)) {
    const searchContext = getDeletionSearchContext(change);
    if (searchContext) {
      const searchResults = editor.commands.search(searchContext, { highlight: false });

      if (searchResults && searchResults.length > 0) {
        const firstResult = searchResults[0];
        return {
          change,
          pmFrom: firstResult.to, // Insert after the context
          pmTo: firstResult.to,
          isDeletion: true,
          contextRange: { from: firstResult.from, to: firstResult.to },
        };
      }
    }
  }

  // Fallback to position mapping
  if (change.insertAt !== undefined) {
    let pmInsertAt = posMap.charToPos[change.insertAt];

    // Try previous position if exact position not found
    if (pmInsertAt === undefined && change.insertAt > 0) {
      const prevPos = posMap.charToPos[change.insertAt - 1];
      if (prevPos !== undefined) {
        pmInsertAt = prevPos + 1;
      }
    }

    if (pmInsertAt !== undefined) {
      return {
        change,
        pmFrom: pmInsertAt,
        pmTo: pmInsertAt,
        isDeletion: true,
      };
    }
  }

  console.warn(`Failed to map deletion "${change.content.substring(0, 30)}..."`);
  return null;
}

/**
 * Sort modifications for safe application (descending by position).
 * Modifications should be applied from end to start to avoid position shifts.
 */
export function sortModificationsForApplication(
  modifications: DocumentModification[]
): DocumentModification[] {
  return [...modifications].sort((a, b) => b.pmFrom - a.pmFrom);
}

/**
 * Get formatting marks from a position in the document.
 * Filters out track change marks to preserve only text formatting.
 *
 * @param tr - The ProseMirror transaction
 * @param contextRange - Optional range to search for marks
 * @param position - Position to get marks from
 * @returns Array of formatting marks
 */
export function getFormattingMarks(
  tr: Transaction,
  contextRange: { from: number; to: number } | undefined,
  position: number
): readonly PMMark[] {
  let existingMarks: readonly PMMark[] = [];

  // Try to get marks from context range first (more reliable)
  if (contextRange) {
    tr.doc.nodesBetween(contextRange.from, contextRange.to, (node: PMNode) => {
      if (node.isText && node.marks.length > 0 && existingMarks.length === 0) {
        existingMarks = node.marks;
      }
    });
  }

  // Fallback: try nodeBefore/nodeAfter at position
  if (existingMarks.length === 0) {
    const $pos = tr.doc.resolve(position);
    existingMarks = getMarksFromResolvedPos($pos);
  }

  // Filter out track change marks
  return filterOutTrackMarks(existingMarks);
}

/**
 * Get marks from a resolved position, trying nodeBefore, then nodeAfter, then position marks
 */
function getMarksFromResolvedPos(
  $pos: { nodeBefore: PMNode | null; nodeAfter: PMNode | null; marks(): readonly PMMark[] }
): readonly PMMark[] {
  if ($pos.nodeBefore && $pos.nodeBefore.isText) {
    return $pos.nodeBefore.marks;
  }

  if ($pos.nodeAfter && $pos.nodeAfter.isText) {
    return $pos.nodeAfter.marks;
  }

  return $pos.marks();
}

/**
 * Filter out track change marks from a marks array
 */
function filterOutTrackMarks(marks: readonly PMMark[]): readonly PMMark[] {
  return marks.filter(
    (m) => !TRACK_MARK_NAMES.includes(m.type.name as (typeof TRACK_MARK_NAMES)[number])
  );
}

/**
 * Create a track insert mark
 */
export function createTrackInsertMark(
  markType: MarkType,
  id: string,
  user: TrackChangeUser,
  date: string
): PMMark {
  return markType.create({
    id,
    author: user.name,
    authorEmail: user.email,
    authorImage: user.image,
    date,
  });
}

/**
 * Create a track delete mark
 */
export function createTrackDeleteMark(
  markType: MarkType,
  id: string,
  user: TrackChangeUser,
  date: string
): PMMark {
  return markType.create({
    id,
    author: user.name,
    authorEmail: user.email,
    authorImage: user.image,
    date,
  });
}

/**
 * Apply track changes to a document.
 * This is the main entry point for applying diff results as track changes.
 *
 * @param editor - The editor instance
 * @param changes - Changes to apply
 * @param posMap - Position mapping from text extraction
 * @param user - User attribution for track changes (default: COMPARISON_USER)
 * @returns Result with success count and errors
 */
export function applyTrackChanges(
  editor: SuperDocEditor,
  changes: ChangeWithPosition[],
  posMap: PositionMap,
  user: TrackChangeUser = COMPARISON_USER
): TrackChangesResult {
  const schema = editor.schema;
  const trackInsertMark = schema.marks.trackInsert;
  const trackDeleteMark = schema.marks.trackDelete;

  if (!trackInsertMark || !trackDeleteMark) {
    console.warn("Track change marks not available in schema");
    return { successCount: 0, totalCount: changes.length, errors: ["Schema missing track marks"] };
  }

  // Build and sort modifications
  const modifications = buildModifications(editor, changes, posMap);
  const sortedMods = sortModificationsForApplication(modifications);

  // Apply all modifications in a single transaction
  let tr = editor.state.tr;
  const now = new Date().toISOString();
  let successCount = 0;
  const errors: string[] = [];

  for (const mod of sortedMods) {
    try {
      tr = applyModification(tr, mod, schema, trackInsertMark, trackDeleteMark, user, now);
      successCount++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Failed to apply ${mod.change.type}: ${errorMsg}`);
    }
  }

  // Dispatch the transaction
  editor.view.dispatch(tr);

  console.log(`Track changes applied: ${successCount}/${changes.length}`);

  return { successCount, totalCount: changes.length, errors };
}

/**
 * Apply a single modification to the transaction
 */
function applyModification(
  tr: Transaction,
  mod: DocumentModification,
  schema: Schema,
  trackInsertMark: MarkType,
  trackDeleteMark: MarkType,
  user: TrackChangeUser,
  date: string
): Transaction {
  const { change, pmFrom, pmTo, isDeletion, contextRange } = mod;

  switch (change.type) {
    case "replacement":
      return applyReplacement(
        tr,
        change,
        pmFrom,
        pmTo,
        schema,
        trackInsertMark,
        trackDeleteMark,
        user,
        date
      );

    case "insertion":
      return applyInsertion(tr, change, pmFrom, pmTo, trackInsertMark, user, date);

    case "deletion":
      if (isDeletion) {
        return applyDeletion(
          tr,
          change,
          pmFrom,
          schema,
          trackDeleteMark,
          user,
          date,
          contextRange
        );
      }
      break;
  }

  return tr;
}

/**
 * Apply a replacement change (delete mark + insert mark)
 */
function applyReplacement(
  tr: Transaction,
  change: ChangeWithPosition,
  pmFrom: number,
  pmTo: number,
  schema: Schema,
  trackInsertMark: MarkType,
  trackDeleteMark: MarkType,
  user: TrackChangeUser,
  date: string
): Transaction {
  // Mark the new text with trackInsert
  const insertMark = createTrackInsertMark(trackInsertMark, `insert-${change.id}`, user, date);
  tr = tr.addMark(pmFrom, pmTo, insertMark);

  // Insert the old (deleted) text before the new text with trackDelete mark
  const deleteMark = createTrackDeleteMark(trackDeleteMark, `delete-${change.id}`, user, date);

  // Get formatting marks from surrounding text
  const formattingMarks = getFormattingMarks(tr, undefined, pmFrom);
  const allMarks = [...formattingMarks, deleteMark];

  // Create text node with delete mark and formatting
  const deletedTextNode = schema.text(change.oldContent!, allMarks);
  tr = tr.insert(pmFrom, deletedTextNode);

  return tr;
}

/**
 * Apply an insertion change (insert mark on existing text)
 */
function applyInsertion(
  tr: Transaction,
  change: ChangeWithPosition,
  pmFrom: number,
  pmTo: number,
  trackInsertMark: MarkType,
  user: TrackChangeUser,
  date: string
): Transaction {
  const insertMark = createTrackInsertMark(trackInsertMark, `insert-${change.id}`, user, date);
  return tr.addMark(pmFrom, pmTo, insertMark);
}

/**
 * Apply a deletion change (insert deleted text with delete mark)
 */
function applyDeletion(
  tr: Transaction,
  change: ChangeWithPosition,
  pmFrom: number,
  schema: Schema,
  trackDeleteMark: MarkType,
  user: TrackChangeUser,
  date: string,
  contextRange?: { from: number; to: number }
): Transaction {
  const deleteMark = createTrackDeleteMark(trackDeleteMark, `delete-${change.id}`, user, date);

  // Get formatting marks from context
  const formattingMarks = getFormattingMarks(tr, contextRange, pmFrom);
  const allMarks = [...formattingMarks, deleteMark];

  // Create text node with delete mark and formatting
  const deletedTextNode = schema.text(change.content, allMarks);
  tr = tr.insert(pmFrom, deletedTextNode);

  return tr;
}

/**
 * Navigate to a change in the editor
 *
 * @param editor - The editor instance
 * @param change - The change to navigate to
 */
export function navigateToChange(
  editor: SuperDocEditor,
  change: ChangeWithPosition
): void {
  if (change.type === "deletion") {
    // Deletions are harder to navigate to since we inserted them
    // Try to search for the deleted content
    const searchText = change.content.substring(0, Math.min(change.content.length, 30));
    const results = editor.commands.search(searchText, { highlight: false });

    if (results && results.length > 0) {
      editor.chain()
        .setTextSelection({ from: results[0].from, to: results[0].to })
        .scrollIntoView()
        .run();
    }
    return;
  }

  // For insertions and replacements, search for the content
  const searchText = change.content.substring(0, Math.min(change.content.length, 50));
  const results = editor.commands.search(searchText, { highlight: false });

  if (results && results.length > 0) {
    editor.chain()
      .setTextSelection({ from: results[0].from, to: results[0].to })
      .scrollIntoView()
      .run();
  }
}
