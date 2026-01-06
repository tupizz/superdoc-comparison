/**
 * Diff Computation Utilities
 *
 * Functions for computing character-level diffs between documents
 * with position tracking for accurate document modifications.
 */

import { diffChars, type Change as DiffChange } from "diff";
import { extractContext } from "./text-extraction";
import type {
  ChangeWithPosition,
  DiffSummary,
  FormattingChangeWithPosition,
  FormattingSpan,
  ProseMirrorMark,
} from "./types";

/**
 * Default context length for deletion positioning
 */
const DEFAULT_CONTEXT_LENGTH = 30;

/**
 * Minimum context length required for reliable search
 */
const MIN_CONTEXT_LENGTH = 5;

/**
 * Compute character-level changes between two texts with position tracking.
 *
 * This function performs a character-level diff and tracks:
 * - For insertions/replacements: exact character positions in modified text
 * - For deletions: position where deleted content should be inserted, plus context
 *
 * @param originalText - The original (older) text
 * @param modifiedText - The modified (newer) text
 * @returns Array of changes with position information
 */
export function computeChangesWithPositions(
  originalText: string,
  modifiedText: string
): ChangeWithPosition[] {
  const diffs = diffChars(originalText, modifiedText);
  const changes: ChangeWithPosition[] = [];
  let changeId = 0;
  let modifiedCharIndex = 0; // Track position in modified text

  for (let i = 0; i < diffs.length; i++) {
    const current = diffs[i];

    // Unchanged text - advance modified position
    if (!current.added && !current.removed) {
      modifiedCharIndex += current.value.length;
      continue;
    }

    const text = current.value.trim();

    // Skip empty changes but still advance position for added text
    if (!text || text.length < 1) {
      if (current.added) {
        modifiedCharIndex += current.value.length;
      }
      continue;
    }

    // Check for replacement (removed followed by added)
    const next = diffs[i + 1];
    if (isReplacement(current, next)) {
      const replacement = createReplacement(
        current,
        next as DiffChange,
        modifiedCharIndex,
        changeId++
      );

      if (replacement) {
        changes.push(replacement);
        modifiedCharIndex += next!.value.length;
        i++; // Skip next item since we processed it
        continue;
      }
    }

    // Handle pure insertion
    if (current.added) {
      const insertion = createInsertion(current, modifiedCharIndex, changeId++);
      changes.push(insertion);
      modifiedCharIndex += current.value.length;
      continue;
    }

    // Handle pure deletion
    if (current.removed) {
      const deletion = createDeletion(
        current,
        modifiedText,
        modifiedCharIndex,
        changeId++
      );
      changes.push(deletion);
      // Don't advance modifiedCharIndex for deletions (they're not in modified text)
    }
  }

  return changes;
}

/**
 * Check if current and next diff parts represent a replacement
 */
function isReplacement(
  current: DiffChange,
  next: DiffChange | undefined
): boolean {
  return (
    current.removed === true &&
    next !== undefined &&
    next.added === true &&
    current.value.trim().length > 0 &&
    next.value.trim().length > 0
  );
}

/**
 * Create a replacement change from a removed/added pair
 */
function createReplacement(
  removed: DiffChange,
  added: DiffChange,
  modifiedCharIndex: number,
  id: number
): ChangeWithPosition | null {
  const oldText = removed.value.trim();
  const newText = added.value.trim();

  if (!oldText || !newText) {
    return null;
  }

  // Calculate the actual start position (accounting for leading whitespace)
  const leadingWhitespace = added.value.length - added.value.trimStart().length;
  const charStart = modifiedCharIndex + leadingWhitespace;
  const charEnd = charStart + newText.length;

  return {
    id: `change-${id}`,
    type: "replacement",
    content: newText,
    oldContent: oldText,
    charStart,
    charEnd,
  };
}

/**
 * Create an insertion change
 */
function createInsertion(
  diff: DiffChange,
  modifiedCharIndex: number,
  id: number
): ChangeWithPosition {
  const text = diff.value.trim();
  const leadingWhitespace = diff.value.length - diff.value.trimStart().length;
  const charStart = modifiedCharIndex + leadingWhitespace;
  const charEnd = charStart + text.length;

  return {
    id: `change-${id}`,
    type: "insertion",
    content: text,
    charStart,
    charEnd,
  };
}

/**
 * Create a deletion change with context for positioning
 */
function createDeletion(
  diff: DiffChange,
  modifiedText: string,
  modifiedCharIndex: number,
  id: number
): ChangeWithPosition {
  const text = diff.value.trim();

  // Capture context before the deletion for finding the exact insertion point
  const contextBefore = extractContext(
    modifiedText,
    modifiedCharIndex,
    DEFAULT_CONTEXT_LENGTH
  );

  return {
    id: `change-${id}`,
    type: "deletion",
    content: text,
    insertAt: modifiedCharIndex,
    contextBefore: contextBefore,
  };
}

/**
 * Compute a summary of changes
 *
 * @param changes - Array of content changes to summarize
 * @param formatChanges - Optional array of formatting changes
 * @returns Summary with counts of each change type
 */
export function computeDiffSummary(
  changes: ChangeWithPosition[],
  formatChanges: FormattingChangeWithPosition[] = []
): DiffSummary {
  let insertions = 0;
  let deletions = 0;
  let replacements = 0;

  for (const change of changes) {
    switch (change.type) {
      case "insertion":
        insertions++;
        break;
      case "deletion":
        deletions++;
        break;
      case "replacement":
        replacements++;
        break;
    }
  }

  return {
    insertions,
    deletions,
    replacements,
    formattingChanges: formatChanges.length,
  };
}

/**
 * Check if a deletion has sufficient context for positioning
 *
 * @param change - The deletion change to check
 * @returns True if there's enough context for reliable positioning
 */
export function hasSufficientContext(change: ChangeWithPosition): boolean {
  return (
    change.type === "deletion" &&
    change.contextBefore !== undefined &&
    change.contextBefore.length >= MIN_CONTEXT_LENGTH
  );
}

/**
 * Get the search context for finding deletion insertion point
 *
 * @param change - The deletion change
 * @param maxLength - Maximum context length to return (default 20)
 * @returns The context string to search for
 */
export function getDeletionSearchContext(
  change: ChangeWithPosition,
  maxLength: number = 20
): string | undefined {
  if (
    !change.contextBefore ||
    change.contextBefore.length < MIN_CONTEXT_LENGTH
  ) {
    return undefined;
  }

  // Use the last portion of the context for search
  const context = change.contextBefore;
  const start = Math.max(0, context.length - maxLength);
  return context.substring(start);
}

/**
 * Filter changes by type
 *
 * @param changes - Array of changes to filter
 * @param type - The type of changes to keep
 * @returns Filtered array of changes
 */
export function filterChangesByType(
  changes: ChangeWithPosition[],
  type: ChangeWithPosition["type"]
): ChangeWithPosition[] {
  return changes.filter((c) => c.type === type);
}

/**
 * Sort changes by position (descending) for safe document modification.
 * Changes should be applied from end to start to avoid position shifting.
 *
 * @param changes - Array of changes to sort
 * @returns New sorted array (does not mutate input)
 */
export function sortChangesForApplication(
  changes: ChangeWithPosition[]
): ChangeWithPosition[] {
  return [...changes].sort((a, b) => {
    const posA = a.charStart ?? a.insertAt ?? 0;
    const posB = b.charStart ?? b.insertAt ?? 0;
    return posB - posA; // Descending order
  });
}

// =============================================================================
// Formatting Change Detection
// =============================================================================

/**
 * Human-readable names for common mark types
 */
const MARK_TYPE_LABELS: Record<string, string> = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strike: "Strikethrough",
  code: "Code",
  link: "Link",
  textStyle: "Text Style",
  highlight: "Highlight",
  subscript: "Subscript",
  superscript: "Superscript",
};

/**
 * Get human-readable label for a mark type
 */
export function getMarkTypeLabel(markType: string): string {
  return MARK_TYPE_LABELS[markType] || markType;
}

/**
 * Get all formatting spans that overlap with a character range
 */
function getSpansInRange(
  formatting: ReadonlyArray<FormattingSpan>,
  rangeStart: number,
  rangeEnd: number
): FormattingSpan[] {
  return formatting.filter(
    (span) => span.charStart < rangeEnd && span.charEnd > rangeStart
  );
}

/**
 * Normalize mark for comparison - extract key identifying attributes
 */
function normalizeMarkKey(mark: ProseMirrorMark): string {
  const attrs = mark.attrs || {};
  // For most marks, type is enough. For some, include key attrs
  if (mark.type === "link") {
    return `${mark.type}:${attrs.href || ""}`;
  }
  if (mark.type === "textStyle") {
    return `${mark.type}:${attrs.color || ""}`;
  }
  if (mark.type === "highlight") {
    return `${mark.type}:${attrs.color || ""}`;
  }
  return mark.type;
}

/**
 * Build a mapping of unchanged text positions between original and modified.
 * This identifies ranges where text content is the same but formatting might differ.
 *
 * @param originalText - Original document text
 * @param modifiedText - Modified document text
 * @returns Array of position mappings { origStart, origEnd, modStart, modEnd }
 */
function buildUnchangedRanges(
  originalText: string,
  modifiedText: string
): Array<{
  origStart: number;
  origEnd: number;
  modStart: number;
  modEnd: number;
  text: string;
}> {
  const diffs = diffChars(originalText, modifiedText);
  const ranges: Array<{
    origStart: number;
    origEnd: number;
    modStart: number;
    modEnd: number;
    text: string;
  }> = [];

  let origPos = 0;
  let modPos = 0;

  for (const diff of diffs) {
    if (!diff.added && !diff.removed) {
      // Unchanged text - record the mapping
      ranges.push({
        origStart: origPos,
        origEnd: origPos + diff.value.length,
        modStart: modPos,
        modEnd: modPos + diff.value.length,
        text: diff.value,
      });
      origPos += diff.value.length;
      modPos += diff.value.length;
    } else if (diff.removed) {
      origPos += diff.value.length;
    } else if (diff.added) {
      modPos += diff.value.length;
    }
  }

  return ranges;
}

/**
 * Compute formatting changes between two documents.
 * This detects marks that were added, removed, or modified on unchanged text.
 *
 * @param originalText - Text from original document
 * @param originalFormatting - Formatting spans from original document
 * @param modifiedText - Text from modified document
 * @param modifiedFormatting - Formatting spans from modified document
 * @returns Array of formatting changes with positions in modified document
 */
export function computeFormattingChanges(
  originalText: string,
  originalFormatting: ReadonlyArray<FormattingSpan>,
  modifiedText: string,
  modifiedFormatting: ReadonlyArray<FormattingSpan>
): FormattingChangeWithPosition[] {
  const changes: FormattingChangeWithPosition[] = [];
  let changeId = 0;

  // Get ranges where text is unchanged (formatting might have changed)
  const unchangedRanges = buildUnchangedRanges(originalText, modifiedText);

  for (const range of unchangedRanges) {
    // Skip very short ranges (whitespace, single chars)
    if (range.text.trim().length < 2) continue;

    // Get ALL formatting spans that overlap with this range
    const origSpans = getSpansInRange(
      originalFormatting,
      range.origStart,
      range.origEnd
    );
    const modSpans = getSpansInRange(
      modifiedFormatting,
      range.modStart,
      range.modEnd
    );

    // Compare marks at each character position
    // We'll iterate through each character position in the range
    for (let offset = 0; offset < range.text.length; offset++) {
      const origPos = range.origStart + offset;
      const modPos = range.modStart + offset;

      // Get marks at this specific position
      const origMarksHere: ProseMirrorMark[] = [];
      const modMarksHere: ProseMirrorMark[] = [];

      for (const span of origSpans) {
        if (origPos >= span.charStart && origPos < span.charEnd) {
          origMarksHere.push(...span.marks);
        }
      }

      for (const span of modSpans) {
        if (modPos >= span.charStart && modPos < span.charEnd) {
          modMarksHere.push(...span.marks);
        }
      }

      // Compare marks at this position
      const origMarkKeys = new Set(origMarksHere.map(normalizeMarkKey));
      const modMarkKeys = new Set(modMarksHere.map(normalizeMarkKey));

      // Find added marks
      for (const modMark of modMarksHere) {
        const key = normalizeMarkKey(modMark);
        if (!origMarkKeys.has(key)) {
          // This mark was added at this position
          // Find the extent of this mark in the modified document
          const modSpan = modSpans.find(
            (s) =>
              modPos >= s.charStart &&
              modPos < s.charEnd &&
              s.marks.some((m) => normalizeMarkKey(m) === key)
          );

          if (modSpan) {
            // Calculate the overlap with the unchanged range
            const spanStartInRange = Math.max(
              modSpan.charStart,
              range.modStart
            );
            const spanEndInRange = Math.min(modSpan.charEnd, range.modEnd);
            const affectedText = modifiedText.slice(
              spanStartInRange,
              spanEndInRange
            );

            changes.push({
              id: `format-${changeId++}`,
              type: "formatAdded",
              content: affectedText.trim().substring(0, 50),
              markType: modMark.type,
              newAttrs: modMark.attrs,
              charStart: spanStartInRange,
              charEnd: spanEndInRange,
            });
          }
        }
      }

      // Find removed marks
      for (const origMark of origMarksHere) {
        const key = normalizeMarkKey(origMark);
        if (!modMarkKeys.has(key)) {
          // This mark was removed at this position
          const origSpan = origSpans.find(
            (s) =>
              origPos >= s.charStart &&
              origPos < s.charEnd &&
              s.marks.some((m) => normalizeMarkKey(m) === key)
          );

          if (origSpan) {
            // Map to modified document positions
            const offsetInOrig = origSpan.charStart - range.origStart;
            const spanStartInMod = range.modStart + Math.max(0, offsetInOrig);
            const spanLengthInRange = Math.min(
              origSpan.charEnd - origSpan.charStart,
              range.modEnd - spanStartInMod
            );
            const spanEndInMod = spanStartInMod + spanLengthInRange;
            const affectedText = modifiedText.slice(
              spanStartInMod,
              spanEndInMod
            );

            changes.push({
              id: `format-${changeId++}`,
              type: "formatRemoved",
              content: affectedText.trim().substring(0, 50),
              markType: origMark.type,
              oldAttrs: origMark.attrs,
              charStart: spanStartInMod,
              charEnd: spanEndInMod,
            });
          }
        }
      }
    }
  }

  // Deduplicate changes (merge adjacent spans with same change)
  return deduplicateFormattingChanges(changes);
}

/**
 * Merge adjacent formatting changes that represent the same logical change
 */
function deduplicateFormattingChanges(
  changes: FormattingChangeWithPosition[]
): FormattingChangeWithPosition[] {
  if (changes.length === 0) return [];

  // Sort by position
  const sorted = [...changes].sort((a, b) => a.charStart - b.charStart);
  const result: FormattingChangeWithPosition[] = [];

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if this is the same change type on adjacent/overlapping text
    const isAdjacent = next.charStart <= current.charEnd + 1;
    const isSameChange =
      current.type === next.type && current.markType === next.markType;

    if (isAdjacent && isSameChange) {
      // Merge: extend the current change
      current = {
        ...current,
        charEnd: Math.max(current.charEnd, next.charEnd),
        content: current.content, // Keep first content
      };
    } else {
      result.push(current);
      current = next;
    }
  }

  result.push(current);
  return result;
}
