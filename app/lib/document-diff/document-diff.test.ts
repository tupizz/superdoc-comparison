/**
 * Document Diff Utilities Tests
 *
 * Tests for text extraction, diff computation, and formatting change detection.
 */

import { describe, it, expect } from "vitest";
import {
  extractTextFromJson,
  extractTextWithFormattingFromJson,
  extractContext,
  getProseMirrorPosition,
  getProseMirrorRange,
} from "./text-extraction";
import {
  computeChangesWithPositions,
  computeDiffSummary,
  computeFormattingChanges,
  filterChangesByType,
  getMarkTypeLabel,
  hasSufficientContext,
  getDeletionSearchContext,
  sortChangesForApplication,
} from "./diff-computation";
import type {
  ProseMirrorJsonNode,
  ChangeWithPosition,
  FormattingSpan,
  PositionMap,
} from "./types";

// =============================================================================
// Text Extraction Tests
// =============================================================================

describe("extractTextFromJson", () => {
  it("should return empty string for null/undefined input", () => {
    expect(extractTextFromJson(null as unknown as ProseMirrorJsonNode)).toBe("");
    expect(extractTextFromJson(undefined as unknown as ProseMirrorJsonNode)).toBe("");
  });

  it("should extract text from a simple text node", () => {
    const node: ProseMirrorJsonNode = {
      type: "text",
      text: "Hello world",
    };
    expect(extractTextFromJson(node)).toBe("Hello world");
  });

  it("should extract text from a paragraph", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    expect(extractTextFromJson(node)).toBe("Hello world");
  });

  it("should add newlines between paragraphs", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First paragraph" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second paragraph" }],
        },
      ],
    };
    expect(extractTextFromJson(node)).toBe("First paragraph\nSecond paragraph");
  });

  it("should handle nested content in headings", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Content" }],
        },
      ],
    };
    expect(extractTextFromJson(node)).toBe("Title\nContent");
  });

  it("should handle list items", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 2" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = extractTextFromJson(node);
    expect(result).toContain("Item 1");
    expect(result).toContain("Item 2");
  });

  it("should add spaces for table cells", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cell 1" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cell 2" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = extractTextFromJson(node);
    expect(result).toContain("Cell 1");
    expect(result).toContain("Cell 2");
  });

  it("should return empty string for node without content", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
    };
    expect(extractTextFromJson(node)).toBe("");
  });
});

describe("extractTextWithFormattingFromJson", () => {
  it("should extract text and empty formatting for plain text", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Plain text" }],
        },
      ],
    };
    const result = extractTextWithFormattingFromJson(node);
    expect(result.text).toBe("Plain text");
    expect(result.formatting).toHaveLength(0);
  });

  it("should capture bold formatting", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            {
              type: "text",
              text: "bold",
              marks: [{ type: "bold" }],
            },
            { type: "text", text: " world" },
          ],
        },
      ],
    };
    const result = extractTextWithFormattingFromJson(node);
    expect(result.text).toBe("Hello bold world");
    expect(result.formatting).toHaveLength(1);
    expect(result.formatting[0]).toEqual({
      charStart: 6,
      charEnd: 10,
      marks: [{ type: "bold" }],
    });
  });

  it("should capture multiple marks on same text", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "styled",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      ],
    };
    const result = extractTextWithFormattingFromJson(node);
    expect(result.formatting).toHaveLength(1);
    expect(result.formatting[0].marks).toHaveLength(2);
    expect(result.formatting[0].marks.map((m) => m.type)).toContain("bold");
    expect(result.formatting[0].marks.map((m) => m.type)).toContain("italic");
  });

  it("should exclude track change marks", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "tracked",
              marks: [
                { type: "bold" },
                { type: "trackInsert", attrs: { id: "123" } },
              ],
            },
          ],
        },
      ],
    };
    const result = extractTextWithFormattingFromJson(node);
    expect(result.formatting).toHaveLength(1);
    expect(result.formatting[0].marks).toHaveLength(1);
    expect(result.formatting[0].marks[0].type).toBe("bold");
  });

  it("should handle multiple formatted spans", () => {
    const node: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ],
        },
      ],
    };
    const result = extractTextWithFormattingFromJson(node);
    expect(result.text).toBe("bold and italic");
    expect(result.formatting).toHaveLength(2);
  });
});

describe("extractContext", () => {
  it("should extract context before position", () => {
    const text = "Hello world, this is a test.";
    expect(extractContext(text, 12)).toBe("Hello world,");
  });

  it("should respect context length", () => {
    const text = "Hello world, this is a test.";
    expect(extractContext(text, 28, 10)).toBe("is a test.");
  });

  it("should handle position at start", () => {
    const text = "Hello world";
    expect(extractContext(text, 0)).toBe("");
  });

  it("should handle short context", () => {
    const text = "Hi";
    expect(extractContext(text, 2)).toBe("Hi");
  });
});

describe("getProseMirrorPosition", () => {
  it("should return position from map", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };
    expect(getProseMirrorPosition(posMap, 0)).toBe(1);
    expect(getProseMirrorPosition(posMap, 2)).toBe(3);
    expect(getProseMirrorPosition(posMap, 4)).toBe(5);
  });

  it("should handle index past end", () => {
    const posMap: PositionMap = {
      text: "Hi",
      charToPos: [1, 2],
    };
    // Index 2 is past the end, should extrapolate
    expect(getProseMirrorPosition(posMap, 2)).toBe(3);
  });

  it("should return undefined for negative index", () => {
    const posMap: PositionMap = {
      text: "Hi",
      charToPos: [1, 2],
    };
    expect(getProseMirrorPosition(posMap, -1)).toBeUndefined();
  });
});

describe("getProseMirrorRange", () => {
  it("should return range for valid indices", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };
    expect(getProseMirrorRange(posMap, 0, 3)).toEqual({ from: 1, to: 4 });
  });

  it("should return undefined for invalid range", () => {
    const posMap: PositionMap = {
      text: "Hi",
      charToPos: [1, 2],
    };
    expect(getProseMirrorRange(posMap, 0, 10)).toBeUndefined();
  });
});

// =============================================================================
// Diff Computation Tests
// =============================================================================

describe("computeChangesWithPositions", () => {
  it("should detect no changes for identical texts", () => {
    const changes = computeChangesWithPositions("Hello world", "Hello world");
    expect(changes).toHaveLength(0);
  });

  it("should detect insertions", () => {
    const changes = computeChangesWithPositions("Hello", "Hello world");
    expect(changes.length).toBeGreaterThan(0);
    const insertion = changes.find((c) => c.type === "insertion");
    expect(insertion).toBeDefined();
    expect(insertion?.content).toBe("world");
  });

  it("should detect deletions", () => {
    const changes = computeChangesWithPositions("Hello world", "Hello");
    expect(changes.length).toBeGreaterThan(0);
    const deletion = changes.find((c) => c.type === "deletion");
    expect(deletion).toBeDefined();
    expect(deletion?.content).toBe("world");
  });

  it("should detect replacements", () => {
    // The diff algorithm works character-by-character and may split replacements
    // if there are shared characters. Use words with no shared chars.
    const changes = computeChangesWithPositions("ABC", "XYZ");
    expect(changes.length).toBeGreaterThan(0);
    // Should have at least one replacement when all chars differ
    const replacement = changes.find((c) => c.type === "replacement");
    expect(replacement).toBeDefined();
    expect(replacement?.type).toBe("replacement");
    expect(replacement?.oldContent).toBeDefined();
    expect(replacement?.content).toBeDefined();
  });

  it("should provide character positions for insertions", () => {
    const changes = computeChangesWithPositions("AB", "AXB");
    const insertion = changes.find((c) => c.type === "insertion");
    expect(insertion?.charStart).toBeDefined();
    expect(insertion?.charEnd).toBeDefined();
  });

  it("should provide insertion point for deletions", () => {
    const changes = computeChangesWithPositions("AXB", "AB");
    const deletion = changes.find((c) => c.type === "deletion");
    expect(deletion?.insertAt).toBeDefined();
  });

  it("should assign unique IDs to changes", () => {
    const changes = computeChangesWithPositions("ABC", "XYZ");
    const ids = changes.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("computeDiffSummary", () => {
  it("should count changes by type", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "insertion", content: "new", charStart: 0, charEnd: 3 },
      { id: "2", type: "deletion", content: "old", insertAt: 0 },
      { id: "3", type: "insertion", content: "another", charStart: 5, charEnd: 12 },
      { id: "4", type: "replacement", content: "new", oldContent: "old", charStart: 0, charEnd: 3 },
    ];
    const summary = computeDiffSummary(changes);
    expect(summary.insertions).toBe(2);
    expect(summary.deletions).toBe(1);
    expect(summary.replacements).toBe(1);
  });

  it("should include formatting changes count", () => {
    const changes: ChangeWithPosition[] = [];
    const formatChanges = [
      { id: "f1", type: "formatAdded" as const, content: "text", markType: "bold", charStart: 0, charEnd: 4 },
      { id: "f2", type: "formatRemoved" as const, content: "text", markType: "italic", charStart: 5, charEnd: 9 },
    ];
    const summary = computeDiffSummary(changes, formatChanges);
    expect(summary.formattingChanges).toBe(2);
  });

  it("should return zeros for empty arrays", () => {
    const summary = computeDiffSummary([]);
    expect(summary.insertions).toBe(0);
    expect(summary.deletions).toBe(0);
    expect(summary.replacements).toBe(0);
    expect(summary.formattingChanges).toBe(0);
  });
});

describe("filterChangesByType", () => {
  const changes: ChangeWithPosition[] = [
    { id: "1", type: "insertion", content: "new", charStart: 0, charEnd: 3 },
    { id: "2", type: "deletion", content: "old", insertAt: 0 },
    { id: "3", type: "replacement", content: "new", oldContent: "old", charStart: 5, charEnd: 8 },
  ];

  it("should filter insertions", () => {
    const result = filterChangesByType(changes, "insertion");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("should filter deletions", () => {
    const result = filterChangesByType(changes, "deletion");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("should filter replacements", () => {
    const result = filterChangesByType(changes, "replacement");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });
});

describe("sortChangesForApplication", () => {
  it("should sort by position descending", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "insertion", content: "a", charStart: 5, charEnd: 6 },
      { id: "2", type: "insertion", content: "b", charStart: 15, charEnd: 16 },
      { id: "3", type: "insertion", content: "c", charStart: 10, charEnd: 11 },
    ];
    const sorted = sortChangesForApplication(changes);
    expect(sorted[0].id).toBe("2"); // position 15
    expect(sorted[1].id).toBe("3"); // position 10
    expect(sorted[2].id).toBe("1"); // position 5
  });

  it("should handle deletions with insertAt", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "deletion", content: "x", insertAt: 5 },
      { id: "2", type: "deletion", content: "y", insertAt: 20 },
    ];
    const sorted = sortChangesForApplication(changes);
    expect(sorted[0].id).toBe("2");
    expect(sorted[1].id).toBe("1");
  });

  it("should not mutate original array", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "insertion", content: "a", charStart: 10, charEnd: 11 },
      { id: "2", type: "insertion", content: "b", charStart: 5, charEnd: 6 },
    ];
    const sorted = sortChangesForApplication(changes);
    expect(changes[0].id).toBe("1"); // Original unchanged
    expect(sorted[0].id).toBe("1"); // Sorted has higher position first
  });
});

describe("getMarkTypeLabel", () => {
  it("should return human-readable labels for known marks", () => {
    expect(getMarkTypeLabel("bold")).toBe("Bold");
    expect(getMarkTypeLabel("italic")).toBe("Italic");
    expect(getMarkTypeLabel("underline")).toBe("Underline");
    expect(getMarkTypeLabel("strike")).toBe("Strikethrough");
    expect(getMarkTypeLabel("code")).toBe("Code");
    expect(getMarkTypeLabel("link")).toBe("Link");
  });

  it("should return mark type as-is for unknown marks", () => {
    expect(getMarkTypeLabel("customMark")).toBe("customMark");
    expect(getMarkTypeLabel("unknownType")).toBe("unknownType");
  });
});

describe("hasSufficientContext", () => {
  it("should return true for deletion with sufficient context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "deleted text",
      insertAt: 10,
      contextBefore: "This is the context before",
    };
    expect(hasSufficientContext(change)).toBe(true);
  });

  it("should return false for deletion with short context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "deleted",
      insertAt: 10,
      contextBefore: "Hi",
    };
    expect(hasSufficientContext(change)).toBe(false);
  });

  it("should return false for non-deletion changes", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "insertion",
      content: "new",
      charStart: 0,
      charEnd: 3,
      contextBefore: "This is sufficient context",
    };
    expect(hasSufficientContext(change)).toBe(false);
  });

  it("should return false for deletion without context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "deleted",
      insertAt: 10,
    };
    expect(hasSufficientContext(change)).toBe(false);
  });
});

describe("getDeletionSearchContext", () => {
  it("should return last portion of context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "deleted",
      insertAt: 10,
      contextBefore: "This is the context before the deletion",
    };
    const result = getDeletionSearchContext(change, 20);
    // Returns last 20 chars of context (includes leading space)
    expect(result).toBe(" before the deletion");
  });

  it("should return undefined for insufficient context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "deleted",
      insertAt: 10,
      contextBefore: "Hi",
    };
    expect(getDeletionSearchContext(change)).toBeUndefined();
  });

  it("should return full context if shorter than maxLength", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "deleted",
      insertAt: 10,
      contextBefore: "Short context",
    };
    const result = getDeletionSearchContext(change, 50);
    expect(result).toBe("Short context");
  });
});

// =============================================================================
// Formatting Change Detection Tests
// =============================================================================

describe("computeFormattingChanges", () => {
  it("should return empty array when no formatting changes", () => {
    const origFormatting: FormattingSpan[] = [];
    const modFormatting: FormattingSpan[] = [];
    const changes = computeFormattingChanges(
      "Hello world",
      origFormatting,
      "Hello world",
      modFormatting
    );
    expect(changes).toHaveLength(0);
  });

  it("should detect added formatting", () => {
    const origFormatting: FormattingSpan[] = [];
    const modFormatting: FormattingSpan[] = [
      { charStart: 0, charEnd: 5, marks: [{ type: "bold" }] },
    ];
    const changes = computeFormattingChanges(
      "Hello world",
      origFormatting,
      "Hello world",
      modFormatting
    );
    expect(changes.length).toBeGreaterThan(0);
    const addedChange = changes.find((c) => c.type === "formatAdded");
    expect(addedChange).toBeDefined();
    expect(addedChange?.markType).toBe("bold");
  });

  it("should detect removed formatting", () => {
    const origFormatting: FormattingSpan[] = [
      { charStart: 0, charEnd: 5, marks: [{ type: "bold" }] },
    ];
    const modFormatting: FormattingSpan[] = [];
    const changes = computeFormattingChanges(
      "Hello world",
      origFormatting,
      "Hello world",
      modFormatting
    );
    expect(changes.length).toBeGreaterThan(0);
    const removedChange = changes.find((c) => c.type === "formatRemoved");
    expect(removedChange).toBeDefined();
    expect(removedChange?.markType).toBe("bold");
  });

  it("should not detect formatting changes in changed text", () => {
    // If text changed, we only track content changes, not formatting
    const origFormatting: FormattingSpan[] = [
      { charStart: 0, charEnd: 5, marks: [{ type: "bold" }] },
    ];
    const modFormatting: FormattingSpan[] = [];
    const changes = computeFormattingChanges(
      "Hello world",
      origFormatting,
      "Goodbye world",
      modFormatting
    );
    // Only unchanged text "world" should be checked for formatting
    // "Hello" vs "Goodbye" is changed text, so bold removal should not be detected there
    const changesInHello = changes.filter(
      (c) => c.charStart < 7 // "Goodbye" length
    );
    expect(changesInHello).toHaveLength(0);
  });

  it("should deduplicate adjacent formatting changes", () => {
    // Same bold applied across multiple text nodes should be merged
    const origFormatting: FormattingSpan[] = [];
    const modFormatting: FormattingSpan[] = [
      { charStart: 0, charEnd: 3, marks: [{ type: "bold" }] },
      { charStart: 3, charEnd: 6, marks: [{ type: "bold" }] },
    ];
    const changes = computeFormattingChanges(
      "Hello world",
      origFormatting,
      "Hello world",
      modFormatting
    );
    // Should be deduplicated to a single change
    const boldChanges = changes.filter((c) => c.markType === "bold");
    expect(boldChanges.length).toBe(1);
  });

  it("should handle link formatting with href attribute", () => {
    const origFormatting: FormattingSpan[] = [];
    const modFormatting: FormattingSpan[] = [
      {
        charStart: 0,
        charEnd: 5,
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      },
    ];
    const changes = computeFormattingChanges(
      "Hello world",
      origFormatting,
      "Hello world",
      modFormatting
    );
    expect(changes.length).toBeGreaterThan(0);
    const linkChange = changes.find((c) => c.markType === "link");
    expect(linkChange).toBeDefined();
    expect(linkChange?.newAttrs?.href).toBe("https://example.com");
  });

  it("should skip very short unchanged ranges", () => {
    // Ranges of 1-2 chars (like spaces) should be ignored
    const origFormatting: FormattingSpan[] = [
      { charStart: 0, charEnd: 1, marks: [{ type: "bold" }] },
    ];
    const modFormatting: FormattingSpan[] = [];
    const changes = computeFormattingChanges(" ", origFormatting, " ", modFormatting);
    expect(changes).toHaveLength(0);
  });
});
