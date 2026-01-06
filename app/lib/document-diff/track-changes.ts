/**
 * Track Changes Application Utilities
 *
 * Functions for applying track change marks (insertions, deletions) to ProseMirror documents.
 */

import type {
  MarkType,
  Mark as PMMark,
  Node as PMNode,
  Schema,
} from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import {
  getDeletionSearchContext,
  hasSufficientContext,
} from "./diff-computation";
import type {
  ChangeWithPosition,
  DocumentModification,
  FormattingChangeWithPosition,
  PositionMap,
  PositionMapWithFormatting,
  SuperDocEditor,
  TrackChangeUser,
  TrackChangesResult,
} from "./types";

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
    console.warn(
      `Position mapping failed for "${change.content.substring(0, 30)}..."`
    );
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
      const searchResults = editor.commands.search(searchContext, {
        highlight: false,
      });

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

  console.warn(
    `Failed to map deletion "${change.content.substring(0, 30)}..."`
  );
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
function getMarksFromResolvedPos($pos: {
  nodeBefore: PMNode | null;
  nodeAfter: PMNode | null;
  marks(): readonly PMMark[];
}): readonly PMMark[] {
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
    (m) =>
      !TRACK_MARK_NAMES.includes(
        m.type.name as (typeof TRACK_MARK_NAMES)[number]
      )
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
 * Apply track changes to a document (legacy method using marks).
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
    return {
      successCount: 0,
      totalCount: changes.length,
      errors: ["Schema missing track marks"],
    };
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
      tr = applyModification(
        tr,
        mod,
        schema,
        trackInsertMark,
        trackDeleteMark,
        user,
        now
      );
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
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Generate HTML comment content for a change with approve/disapprove context
 */
function generateChangeCommentHtml(change: ChangeWithPosition): string {
  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  switch (change.type) {
    case "insertion":
      return `
        <div style="font-family: system-ui, sans-serif;">
          <p style="margin: 0 0 8px 0; color: #166534; font-weight: 600;">
            ✚ Text Added
          </p>
          <p style="margin: 0 0 12px 0; padding: 8px; background: #dcfce7; border-radius: 4px; font-size: 13px;">
            "${escapeHtml(truncateText(change.content, 150))}"
          </p>
        </div>
      `.trim();

    case "deletion":
      return `
        <div style="font-family: system-ui, sans-serif;">
          <p style="margin: 0 0 8px 0; color: #dc2626; font-weight: 600;">
            ✖ Text Removed
          </p>
          <p style="margin: 0 0 12px 0; padding: 8px; background: #fee2e2; border-radius: 4px; font-size: 13px; text-decoration: line-through;">
            "${escapeHtml(truncateText(change.content, 150))}"
          </p>
        </div>
      `.trim();

    case "replacement":
      return `
        <div style="font-family: system-ui, sans-serif;">
          <p style="margin: 0 0 8px 0; color: #ca8a04; font-weight: 600;">
            ↔ Text Replaced
          </p>
          <div style="margin: 0 0 8px 0; padding: 8px; background: #fee2e2; border-radius: 4px; font-size: 13px;">
            <span style="color: #991b1b; font-weight: 500;">Before:</span>
            <span style="text-decoration: line-through;">"${escapeHtml(
              truncateText(change.oldContent || "", 100)
            )}"</span>
          </div>
          <div style="margin: 0 0 12px 0; padding: 8px; background: #dcfce7; border-radius: 4px; font-size: 13px;">
            <span style="color: #166534; font-weight: 500;">After:</span>
            "${escapeHtml(truncateText(change.content, 100))}"
          </div>
        </div>
      `.trim();

    default:
      return `<p>Modified content - please review.</p>`;
  }
}

/**
 * Add explanatory comments to each change in the document.
 * Should be called after applyTrackChanges to add comments at the actual track change mark positions.
 *
 * Comments include:
 * - What type of change occurred (addition, deletion, replacement)
 * - The actual content that was changed
 * - Visual styling to make the change type clear
 *
 * Users can then approve (resolve) or reject (remove) each comment.
 *
 * @param editor - The editor instance
 * @param changes - Changes to add comments for
 * @param authorName - Name of the comment author (default: "Document Comparison")
 * @param authorEmail - Email of the comment author
 * @returns Object with success count and any errors
 */
export function addCommentsToChanges(
  editor: SuperDocEditor,
  changes: ChangeWithPosition[],
  authorName: string = "Document Comparison",
  authorEmail: string = "comparison@system"
): { successCount: number; totalCount: number; errors: string[] } {
  const errors: string[] = [];
  let successCount = 0;

  // Check if insertComment command is available
  if (typeof editor.commands.insertComment !== "function") {
    console.warn("insertComment command not available");
    return {
      successCount: 0,
      totalCount: changes.length,
      errors: ["insertComment command not available"],
    };
  }

  // Find all track change marks in the document (these are the actual positions after applying track changes)
  const trackMarks = findTrackChangeMarks(editor);

  // Create a map of change ID to change for quick lookup
  const changeMap = new Map<string, ChangeWithPosition>();
  for (const change of changes) {
    changeMap.set(change.id, change);
    // Also map by insert/delete ID pattern used in applyTrackChanges
    changeMap.set(`insert-${change.id}`, change);
    changeMap.set(`delete-${change.id}`, change);
  }

  // Process each track mark and add a comment at its position
  const processedChangeIds = new Set<string>();

  for (const mark of trackMarks) {
    try {
      // Find the corresponding change by mark ID
      const change = changeMap.get(mark.id || "");
      if (!change) {
        continue;
      }

      // Skip if we already processed this change (replacements have both insert and delete marks)
      if (processedChangeIds.has(change.id)) {
        continue;
      }
      processedChangeIds.add(change.id);

      const { from, to } = mark;

      // Set selection to the track change mark range
      editor.commands.setTextSelection({ from, to });

      // Generate rich HTML comment content
      const commentText = generateChangeCommentHtml(change);

      // Insert the comment
      editor.commands.insertComment({
        commentId: `comment-${change.id}`,
        commentText,
        creatorName: authorName,
        creatorEmail: authorEmail,
        isInternal: false, // Make visible to all users
      });

      successCount++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Failed to add comment: ${errorMsg}`);
    }
  }

  return { successCount, totalCount: changes.length, errors };
}

/**
 * Approve (accept) a change - applies the change to the document permanently.
 *
 * For insertions: The inserted text is kept and the track mark is removed.
 * For deletions: The deleted text is removed from the document.
 * For replacements: Both the insertion is kept and the deletion is removed.
 *
 * NOTE: SuperDoc's native commands don't work with programmatically-created marks
 * because they're not registered in SuperDoc's internal track changes state.
 * We use direct ProseMirror transactions instead.
 *
 * @param editor - The editor instance
 * @param changeId - The change ID to approve
 * @param changeType - The type of change (insertion, deletion, replacement)
 * @returns True if successful
 */
export function approveChange(
  editor: SuperDocEditor,
  changeId: string,
  changeType?: "insertion" | "deletion" | "replacement"
): boolean {
  const result = manuallyAcceptChange(editor, changeId, changeType);

  // Also try to remove the comment if present
  if (result) {
    const commands = editor.commands as Record<string, unknown>;
    if (typeof commands.removeComment === "function") {
      try {
        (commands.removeComment as (opts: { commentId: string }) => void)({
          commentId: `comment-${changeId}`,
        });
      } catch {
        // Comment may not exist, ignore
      }
    }
  }

  return result;
}

/**
 * Manually accept a change by removing track marks and keeping/removing content appropriately
 */
function manuallyAcceptChange(
  editor: SuperDocEditor,
  changeId: string,
  _changeType?: "insertion" | "deletion" | "replacement"
): boolean {
  const schema = editor.schema;
  const trackInsertMark = schema.marks.trackInsert;
  const trackDeleteMark = schema.marks.trackDelete;

  if (!trackInsertMark || !trackDeleteMark) {
    return false;
  }

  const insertMarkId = `insert-${changeId}`;
  const deleteMarkId = `delete-${changeId}`;

  let tr = editor.state.tr;
  let modified = false;

  // Find all marks for this change
  const marks = findTrackChangeMarks(editor);

  // Process marks from end to start to avoid position shifts
  const relevantMarks = marks
    .filter((m) => m.id === insertMarkId || m.id === deleteMarkId)
    .sort((a, b) => b.from - a.from);

  for (const mark of relevantMarks) {
    if (mark.id === insertMarkId) {
      // For insertions: keep the text, just remove the mark
      const mappedFrom = tr.mapping.map(mark.from);
      const mappedTo = tr.mapping.map(mark.to);
      tr = tr.removeMark(mappedFrom, mappedTo, trackInsertMark);
      modified = true;
    } else if (mark.id === deleteMarkId) {
      // For deletions: remove the deleted text entirely
      const mappedFrom = tr.mapping.map(mark.from);
      const mappedTo = tr.mapping.map(mark.to);
      tr = tr.delete(mappedFrom, mappedTo);
      modified = true;
    }
  }

  if (modified) {
    editor.view.dispatch(tr);
    return true;
  }

  return false;
}

/**
 * Reject a change - reverts the change in the document.
 *
 * For insertions: The inserted text is removed from the document.
 * For deletions: The deleted text is restored to the document.
 * For replacements: The new text is removed and old text is restored.
 *
 * NOTE: SuperDoc's native commands don't work with programmatically-created marks
 * because they're not registered in SuperDoc's internal track changes state.
 * We use direct ProseMirror transactions instead.
 *
 * @param editor - The editor instance
 * @param changeId - The change ID to reject
 * @param changeType - The type of change (insertion, deletion, replacement)
 * @returns True if successful
 */
export function rejectChange(
  editor: SuperDocEditor,
  changeId: string,
  changeType?: "insertion" | "deletion" | "replacement"
): boolean {
  const result = manuallyRejectChange(editor, changeId, changeType);

  // Also try to remove the comment if present
  if (result) {
    const commands = editor.commands as Record<string, unknown>;
    if (typeof commands.removeComment === "function") {
      try {
        (commands.removeComment as (opts: { commentId: string }) => void)({
          commentId: `comment-${changeId}`,
        });
      } catch {
        // Comment may not exist, ignore
      }
    }
  }

  return result;
}

/**
 * Manually reject a change by removing/restoring content appropriately
 */
function manuallyRejectChange(
  editor: SuperDocEditor,
  changeId: string,
  _changeType?: "insertion" | "deletion" | "replacement"
): boolean {
  const schema = editor.schema;
  const trackInsertMark = schema.marks.trackInsert;
  const trackDeleteMark = schema.marks.trackDelete;

  if (!trackInsertMark || !trackDeleteMark) {
    return false;
  }

  const insertMarkId = `insert-${changeId}`;
  const deleteMarkId = `delete-${changeId}`;

  let tr = editor.state.tr;
  let modified = false;

  // Find all marks for this change
  const marks = findTrackChangeMarks(editor);

  // Process marks from end to start to avoid position shifts
  const relevantMarks = marks
    .filter((m) => m.id === insertMarkId || m.id === deleteMarkId)
    .sort((a, b) => b.from - a.from);

  for (const mark of relevantMarks) {
    if (mark.id === insertMarkId) {
      // For insertions: remove the inserted text (reject = undo the insertion)
      const mappedFrom = tr.mapping.map(mark.from);
      const mappedTo = tr.mapping.map(mark.to);
      tr = tr.delete(mappedFrom, mappedTo);
      modified = true;
    } else if (mark.id === deleteMarkId) {
      // For deletions: keep the text, just remove the mark (reject = keep original)
      const mappedFrom = tr.mapping.map(mark.from);
      const mappedTo = tr.mapping.map(mark.to);
      tr = tr.removeMark(mappedFrom, mappedTo, trackDeleteMark);
      modified = true;
    }
  }

  if (modified) {
    editor.view.dispatch(tr);
    return true;
  }

  return false;
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
      return applyInsertion(
        tr,
        change,
        pmFrom,
        pmTo,
        trackInsertMark,
        user,
        date
      );

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
  const insertMark = createTrackInsertMark(
    trackInsertMark,
    `insert-${change.id}`,
    user,
    date
  );
  tr = tr.addMark(pmFrom, pmTo, insertMark);

  // Insert the old (deleted) text before the new text with trackDelete mark
  const deleteMark = createTrackDeleteMark(
    trackDeleteMark,
    `delete-${change.id}`,
    user,
    date
  );

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
  const insertMark = createTrackInsertMark(
    trackInsertMark,
    `insert-${change.id}`,
    user,
    date
  );
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
  const deleteMark = createTrackDeleteMark(
    trackDeleteMark,
    `delete-${change.id}`,
    user,
    date
  );

  // Get formatting marks from context
  const formattingMarks = getFormattingMarks(tr, contextRange, pmFrom);
  const allMarks = [...formattingMarks, deleteMark];

  // Create text node with delete mark and formatting
  const deletedTextNode = schema.text(change.content, allMarks);
  tr = tr.insert(pmFrom, deletedTextNode);

  return tr;
}

/**
 * Find all track change marks in the document with their positions
 */
function findTrackChangeMarks(
  editor: SuperDocEditor
): Array<{ from: number; to: number; type: "insert" | "delete"; id?: string }> {
  const marks: Array<{
    from: number;
    to: number;
    type: "insert" | "delete";
    id?: string;
  }> = [];
  const { doc } = editor.state;

  doc.descendants((node, pos) => {
    if (node.isText && node.marks) {
      for (const mark of node.marks) {
        if (mark.type.name === "trackInsert") {
          marks.push({
            from: pos,
            to: pos + node.nodeSize,
            type: "insert",
            id: mark.attrs?.id,
          });
        } else if (mark.type.name === "trackDelete") {
          marks.push({
            from: pos,
            to: pos + node.nodeSize,
            type: "delete",
            id: mark.attrs?.id,
          });
        }
      }
    }
    return true;
  });

  return marks;
}

// =============================================================================
// Formatting Track Changes
// =============================================================================

/**
 * Apply track format marks to highlight formatting changes.
 * Uses the trackFormat mark to show where formatting was modified.
 *
 * @param editor - The editor instance
 * @param formattingChanges - Formatting changes to apply
 * @param posMap - Position mapping (must include charToPos)
 * @param user - User attribution for track changes
 * @returns Result with success count and errors
 */
export function applyFormattingTrackChanges(
  editor: SuperDocEditor,
  formattingChanges: FormattingChangeWithPosition[],
  posMap: PositionMap | PositionMapWithFormatting,
  user: TrackChangeUser = COMPARISON_USER
): TrackChangesResult {
  const schema = editor.schema;
  const trackFormatMark = schema.marks.trackFormat;

  if (!trackFormatMark) {
    console.warn("trackFormat mark not available in schema");
    return {
      successCount: 0,
      totalCount: formattingChanges.length,
      errors: ["Schema missing trackFormat mark"],
    };
  }

  let tr = editor.state.tr;
  const now = new Date().toISOString();
  let successCount = 0;
  const errors: string[] = [];

  // Sort by position descending for safe application
  const sortedChanges = [...formattingChanges].sort(
    (a, b) => b.charStart - a.charStart
  );

  for (const change of sortedChanges) {
    try {
      // Map character positions to ProseMirror positions
      const pmFrom = posMap.charToPos[change.charStart];
      const pmTo = posMap.charToPos[change.charEnd - 1];

      if (pmFrom === undefined || pmTo === undefined) {
        errors.push(
          `Position mapping failed for formatting change: ${change.content.substring(0, 20)}...`
        );
        continue;
      }

      // Create the track format mark with change info
      const mark = trackFormatMark.create({
        id: change.id,
        author: user.name,
        authorEmail: user.email,
        authorImage: user.image,
        date: now,
        // Store change details in attrs for display
        changeType: change.type,
        markType: change.markType,
        oldAttrs: change.oldAttrs ? JSON.stringify(change.oldAttrs) : undefined,
        newAttrs: change.newAttrs ? JSON.stringify(change.newAttrs) : undefined,
      });

      tr = tr.addMark(pmFrom, pmTo + 1, mark);
      successCount++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`Failed to apply formatting change: ${errorMsg}`);
    }
  }

  // Dispatch the transaction
  if (successCount > 0) {
    editor.view.dispatch(tr);
  }

  console.log(
    `Formatting track changes applied: ${successCount}/${formattingChanges.length}`
  );

  return { successCount, totalCount: formattingChanges.length, errors };
}

/**
 * Navigate to a formatting change in the editor.
 * Finds the trackFormat mark by ID and selects it.
 *
 * @param editor - The editor instance
 * @param change - The formatting change to navigate to
 */
export function navigateToFormattingChange(
  editor: SuperDocEditor,
  change: FormattingChangeWithPosition
): void {
  const doc = editor.state.doc;
  let foundFrom: number | null = null;
  let foundTo: number | null = null;

  // Search for the trackFormat mark with matching ID
  doc.descendants((node, pos) => {
    if (foundFrom !== null) return false; // Stop if already found

    if (node.isText) {
      for (const mark of node.marks) {
        if (mark.type.name === "trackFormat" && mark.attrs.id === change.id) {
          foundFrom = pos;
          foundTo = pos + node.nodeSize;
          return false; // Stop traversal
        }
      }
    }
    return true; // Continue traversal
  });

  if (foundFrom === null || foundTo === null) {
    console.warn("Could not find trackFormat mark for change:", change.id);
    return;
  }

  // Set selection
  editor.commands.setTextSelection({ from: foundFrom, to: foundTo });

  // Scroll into view
  setTimeout(() => {
    try {
      const findScrollContainer = (
        startElement: HTMLElement | null
      ): HTMLElement | null => {
        let current = startElement;
        while (current) {
          const style = window.getComputedStyle(current);
          const hasOverflow =
            style.overflow === "auto" ||
            style.overflow === "scroll" ||
            style.overflowY === "auto" ||
            style.overflowY === "scroll";
          const isScrollable = current.scrollHeight > current.clientHeight + 10;

          if (hasOverflow && isScrollable) {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      };

      const presentationEditor = editor.presentationEditor as unknown as {
        visibleHost?: HTMLElement;
        element?: HTMLElement;
      } | null;

      const startElement =
        presentationEditor?.visibleHost ||
        presentationEditor?.element ||
        (document.querySelector(".presentation-editor") as HTMLElement);

      let scrollContainer = findScrollContainer(startElement);

      if (!scrollContainer) {
        const superdocMain = document.getElementById("superdoc-main");
        scrollContainer = findScrollContainer(superdocMain);
      }

      if (scrollContainer && foundFrom !== null) {
        const docLength = editor.state.doc.content.size;
        const positionRatio = foundFrom / docLength;
        const maxScroll =
          scrollContainer.scrollHeight - scrollContainer.clientHeight;
        const scrollTo = positionRatio * maxScroll;

        scrollContainer.scrollTo({
          top: Math.max(0, scrollTo),
          behavior: "smooth",
        });
      }
    } catch {
      // Silently fail - selection is still set
    }
  }, 100);

  editor.view.focus();
}

/**
 * Navigate to a change in the editor
 * Finds track change marks by matching content/id and selects the text
 *
 * @param editor - The editor instance
 * @param change - The change to navigate to
 */
export async function navigateToChange(
  editor: SuperDocEditor,
  change: ChangeWithPosition
): Promise<void> {
  // Find all track change marks in document
  const trackMarks = findTrackChangeMarks(editor);

  // Determine which mark type to look for
  const targetType = change.type === "deletion" ? "delete" : "insert";

  // Find mark matching this change by ID
  let targetMark = trackMarks.find(
    (m) => m.type === targetType && m.id === change.id
  );

  // If not found by ID, try to find by content match
  if (!targetMark) {
    const searchContent = change.content.trim().substring(0, 30);
    const { doc } = editor.state;

    for (const mark of trackMarks) {
      if (mark.type === targetType) {
        const text = doc.textBetween(mark.from, mark.to);
        if (
          text.includes(searchContent) ||
          searchContent.includes(text.trim())
        ) {
          targetMark = mark;
          break;
        }
      }
    }
  }

  if (!targetMark) {
    console.warn(
      "[navigateToChange] No matching mark found for:",
      change.id,
      change.content.substring(0, 30)
    );
    return;
  }

  const { from, to } = targetMark;

  // Set selection
  editor.commands.setTextSelection({ from, to });

  // SuperDoc uses a hidden editor + visible paginated pages
  // We need to find the actual scroll container and scroll based on position ratio
  setTimeout(() => {
    try {
      // Find the scroll container by looking for an element with overflow:auto/scroll
      const findScrollContainer = (
        startElement: HTMLElement | null
      ): HTMLElement | null => {
        let current = startElement;
        while (current) {
          const style = window.getComputedStyle(current);
          const hasOverflow =
            style.overflow === "auto" ||
            style.overflow === "scroll" ||
            style.overflowY === "auto" ||
            style.overflowY === "scroll";
          const isScrollable = current.scrollHeight > current.clientHeight + 10;

          if (hasOverflow && isScrollable) {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      };

      // Get presentationEditor element and find scroll container from there
      const presentationEditor = editor.presentationEditor as unknown as {
        visibleHost?: HTMLElement;
        element?: HTMLElement;
      } | null;

      const startElement =
        presentationEditor?.visibleHost ||
        presentationEditor?.element ||
        (document.querySelector(".presentation-editor") as HTMLElement);

      let scrollContainer = findScrollContainer(startElement);

      // Fallback: find scroll container from #superdoc-main
      if (!scrollContainer) {
        const superdocMain = document.getElementById("superdoc-main");
        scrollContainer = findScrollContainer(superdocMain);
      }

      if (scrollContainer) {
        // Calculate scroll position based on document position ratio
        const docLength = editor.state.doc.content.size;
        const positionRatio = from / docLength;
        const maxScroll =
          scrollContainer.scrollHeight - scrollContainer.clientHeight;
        const scrollTo = positionRatio * maxScroll;

        scrollContainer.scrollTo({
          top: Math.max(0, scrollTo),
          behavior: "smooth",
        });
      }
    } catch (e) {
      // Silently fail - selection is still set
    }
  }, 100);

  editor.view.focus();
}
