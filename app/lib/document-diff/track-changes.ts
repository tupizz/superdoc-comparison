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
  PositionMap,
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
 * Apply track changes using SuperDoc's suggesting mode.
 * This loads the ORIGINAL document and applies actual changes (deletes/inserts)
 * with track changes enabled, so SuperDoc shows proper "Removed"/"Added" labels.
 *
 * @param editor - The editor instance (should have ORIGINAL document loaded)
 * @param changes - Changes computed from original vs modified
 * @param originalPosMap - Position mapping from the original document
 * @returns Result with success count and errors
 */
export function applyTrackChangesForSuggesting(
  editor: SuperDocEditor,
  changes: ChangeWithPosition[],
  originalPosMap: PositionMap
): TrackChangesResult {
  const errors: string[] = [];
  let successCount = 0;

  // Check if enableTrackChanges command is available
  const commands = editor.commands as Record<string, unknown>;
  if (typeof commands.enableTrackChanges !== "function") {
    console.warn("enableTrackChanges command not available");
    return {
      successCount: 0,
      totalCount: changes.length,
      errors: ["enableTrackChanges not available"],
    };
  }

  // Enable track changes mode
  (commands.enableTrackChanges as () => void)();

  try {
    // Sort changes by position descending (apply from end to start to avoid position shifts)
    const sortedChanges = [...changes].sort((a, b) => {
      // For deletions in original: use charStart (position in original text)
      // For insertions: use insertAt (position where to insert in original)
      const posA =
        a.type === "deletion"
          ? a.charStart ?? 0
          : a.insertAt ?? a.charStart ?? 0;
      const posB =
        b.type === "deletion"
          ? b.charStart ?? 0
          : b.insertAt ?? b.charStart ?? 0;
      return posB - posA;
    });

    for (const change of sortedChanges) {
      try {
        if (change.type === "deletion") {
          // Text exists in original, not in modified → DELETE it
          // The change.content is the deleted text, we need to find and delete it
          if (change.charStart !== undefined && change.charEnd !== undefined) {
            const pmFrom = originalPosMap.charToPos[change.charStart];
            const pmTo = originalPosMap.charToPos[change.charEnd - 1];

            if (pmFrom !== undefined && pmTo !== undefined) {
              // Select and delete the text
              editor.commands.setTextSelection({ from: pmFrom, to: pmTo + 1 });
              // Delete by replacing with empty string
              const { tr } = editor.state;
              const newTr = tr.deleteSelection();
              editor.view.dispatch(newTr);
              successCount++;
            }
          }
        } else if (change.type === "insertion") {
          // Text exists in modified, not in original → INSERT it
          // Find where to insert based on context
          if (change.insertAt !== undefined) {
            let pmInsertAt = originalPosMap.charToPos[change.insertAt];

            // Fallback: try previous position
            if (pmInsertAt === undefined && change.insertAt > 0) {
              const prevPos = originalPosMap.charToPos[change.insertAt - 1];
              if (prevPos !== undefined) {
                pmInsertAt = prevPos + 1;
              }
            }

            if (pmInsertAt !== undefined) {
              // Position cursor and insert
              editor.commands.setTextSelection({
                from: pmInsertAt,
                to: pmInsertAt,
              });
              const { tr, schema } = editor.state;
              const textNode = schema.text(change.content);
              const newTr = tr.insert(pmInsertAt, textNode);
              editor.view.dispatch(newTr);
              successCount++;
            }
          }
        } else if (change.type === "replacement") {
          // Text was replaced: DELETE old text, INSERT new text
          if (change.charStart !== undefined && change.charEnd !== undefined) {
            const pmFrom = originalPosMap.charToPos[change.charStart];
            const pmTo = originalPosMap.charToPos[change.charEnd - 1];

            if (pmFrom !== undefined && pmTo !== undefined) {
              // Select and replace the text
              editor.commands.setTextSelection({ from: pmFrom, to: pmTo + 1 });
              const { tr, schema } = editor.state;
              const textNode = schema.text(change.content);
              const newTr = tr.replaceSelectionWith(textNode, false);
              editor.view.dispatch(newTr);
              successCount++;
            }
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        errors.push(`Failed to apply ${change.type}: ${errorMsg}`);
      }
    }
  } finally {
    // Disable track changes mode
    if (typeof commands.disableTrackChanges === "function") {
      (commands.disableTrackChanges as () => void)();
    }
  }

  console.log(
    `Track changes (suggesting) applied: ${successCount}/${changes.length}`
  );

  return { successCount, totalCount: changes.length, errors };
}

/**
 * Generate a comment description for a change
 */
function generateCommentText(change: ChangeWithPosition): string {
  switch (change.type) {
    case "insertion":
      return `<p><strong>Added:</strong> "${truncateText(
        change.content,
        100
      )}"</p>`;

    case "deletion":
      return `<p><strong>Removed:</strong> "${truncateText(
        change.content,
        100
      )}"</p>`;

    case "replacement":
      return `<p><strong>Changed from:</strong> "${truncateText(
        change.oldContent || "",
        50
      )}"</p><p><strong>To:</strong> "${truncateText(change.content, 50)}"</p>`;

    default:
      return `<p>Modified content</p>`;
  }
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

  console.log(`Comments added: ${successCount}/${changes.length}`);

  return { successCount, totalCount: changes.length, errors };
}

/**
 * Approve a change by resolving its comment.
 * The track change mark remains but the comment is marked as resolved.
 *
 * @param editor - The editor instance
 * @param changeId - The change ID to approve
 * @returns True if successful
 */
export function approveChange(
  editor: SuperDocEditor,
  changeId: string
): boolean {
  const commentId = `comment-${changeId}`;

  if (typeof editor.commands.resolveComment !== "function") {
    console.warn("resolveComment command not available");
    return false;
  }

  try {
    editor.commands.resolveComment({ commentId });
    console.log(`Change ${changeId} approved`);
    return true;
  } catch (e) {
    console.warn(`Failed to approve change ${changeId}:`, e);
    return false;
  }
}

/**
 * Reject a change by removing its comment.
 * Note: This only removes the comment, not the track change mark itself.
 * To fully reject, you would also need to accept/reject the track change.
 *
 * @param editor - The editor instance
 * @param changeId - The change ID to reject
 * @returns True if successful
 */
export function rejectChange(
  editor: SuperDocEditor,
  changeId: string
): boolean {
  const commentId = `comment-${changeId}`;

  if (typeof editor.commands.removeComment !== "function") {
    console.warn("removeComment command not available");
    return false;
  }

  try {
    editor.commands.removeComment({ commentId });
    console.log(`Change ${changeId} rejected`);
    return true;
  } catch (e) {
    console.warn(`Failed to reject change ${changeId}:`, e);
    return false;
  }
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
