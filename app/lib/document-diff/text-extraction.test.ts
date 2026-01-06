/**
 * Text Extraction Utilities - Tests & Documentation
 *
 * This test file serves as live documentation for the text extraction utilities.
 * These functions extract plain text and formatting information from ProseMirror
 * documents for use in diff comparison operations.
 *
 * Key concepts:
 * - ProseMirror documents are tree structures with nodes and marks
 * - Text extraction flattens this tree into plain text
 * - Position mapping tracks where each character came from in the document
 * - Formatting spans track which marks apply to which text ranges
 *
 * @module text-extraction
 */

import { describe, it, expect } from "vitest";
import {
  extractTextFromJson,
  extractTextWithFormattingFromJson,
  extractContext,
  getProseMirrorPosition,
  getProseMirrorRange,
} from "./text-extraction";
import type { ProseMirrorJsonNode, PositionMap } from "./types";

describe("extractTextFromJson", () => {
  it("should extract text from a simple text node", () => {
    const node: ProseMirrorJsonNode = {
      type: "text",
      text: "Hello world",
    };

    const result = extractTextFromJson(node);

    expect(result).toBe("Hello world");
  });

  it("should extract text from a paragraph", () => {
    const node: ProseMirrorJsonNode = {
      type: "paragraph",
      content: [{ type: "text", text: "Hello world" }],
    };

    const result = extractTextFromJson(node);

    expect(result).toBe("Hello world");
  });

  it("should add newlines between paragraphs", () => {
    const doc: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First paragraph" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] },
      ],
    };

    const result = extractTextFromJson(doc);

    expect(result).toContain("First paragraph");
    expect(result).toContain("\n");
    expect(result).toContain("Second paragraph");
  });

  it("should handle empty nodes", () => {
    const node: ProseMirrorJsonNode = {
      type: "paragraph",
      content: [],
    };

    const result = extractTextFromJson(node);

    expect(result).toBe("");
  });

  it("should handle null/undefined input", () => {
    expect(extractTextFromJson(null as unknown as ProseMirrorJsonNode)).toBe("");
    expect(extractTextFromJson(undefined as unknown as ProseMirrorJsonNode)).toBe("");
  });

  it("should handle nested content", () => {
    const doc: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Quoted text" }] },
          ],
        },
      ],
    };

    const result = extractTextFromJson(doc);

    expect(result).toContain("Quoted text");
  });

  it("should handle headings", () => {
    const doc: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Content" }] },
      ],
    };

    const result = extractTextFromJson(doc);

    expect(result).toContain("Title");
    expect(result).toContain("Content");
  });

  it("should handle table cells with spaces", () => {
    const doc: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell 1" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell 2" }] }] },
              ],
            },
          ],
        },
      ],
    };

    const result = extractTextFromJson(doc);

    expect(result).toContain("Cell 1");
    expect(result).toContain("Cell 2");
  });

  it("should preserve inline text within paragraphs", () => {
    const node: ProseMirrorJsonNode = {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world", marks: [{ type: "bold" }] },
        { type: "text", text: "!" },
      ],
    };

    const result = extractTextFromJson(node);

    expect(result).toBe("Hello world!");
  });
});

describe("extractContext", () => {
  it("should extract context before a position", () => {
    const text = "The quick brown fox jumps over the lazy dog";

    const context = extractContext(text, 20, 10);

    expect(context.length).toBeLessThanOrEqual(10);
  });

  it("should handle position at the beginning", () => {
    const text = "Hello world";

    const context = extractContext(text, 0, 10);

    expect(context).toBe("");
  });

  it("should handle short text", () => {
    const text = "Hi";

    const context = extractContext(text, 2, 10);

    expect(context).toBe("Hi");
  });

  it("should trim whitespace from context", () => {
    const text = "   Hello   world   ";

    const context = extractContext(text, 10, 15);

    expect(context).not.toMatch(/^\s/);
    expect(context).not.toMatch(/\s$/);
  });

  it("should use default context length", () => {
    const text = "A".repeat(50);

    const context = extractContext(text, 50);

    expect(context.length).toBeLessThanOrEqual(30);
  });
});

describe("getProseMirrorPosition", () => {
  it("should return position for valid index", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };

    expect(getProseMirrorPosition(posMap, 0)).toBe(1);
    expect(getProseMirrorPosition(posMap, 2)).toBe(3);
    expect(getProseMirrorPosition(posMap, 4)).toBe(5);
  });

  it("should return undefined for negative index", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };

    expect(getProseMirrorPosition(posMap, -1)).toBeUndefined();
  });

  it("should handle index past the end", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };

    // Should extrapolate based on last position
    const pos = getProseMirrorPosition(posMap, 6);
    expect(pos).toBeDefined();
    expect(pos).toBe(7); // 5 + (6 - 4)
  });

  it("should handle empty position map", () => {
    const posMap: PositionMap = {
      text: "",
      charToPos: [],
    };

    expect(getProseMirrorPosition(posMap, 0)).toBeUndefined();
  });
});

describe("getProseMirrorRange", () => {
  it("should return range for valid indices", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };

    const range = getProseMirrorRange(posMap, 0, 5);

    expect(range).toEqual({ from: 1, to: 6 });
  });

  it("should return undefined for invalid start", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };

    const range = getProseMirrorRange(posMap, 10, 15);

    expect(range).toBeUndefined();
  });

  it("should return undefined for invalid end", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };

    const range = getProseMirrorRange(posMap, 0, 20);

    expect(range).toBeUndefined();
  });

  it("should handle single character range", () => {
    const posMap: PositionMap = {
      text: "Hello",
      charToPos: [1, 2, 3, 4, 5],
    };

    const range = getProseMirrorRange(posMap, 2, 3);

    expect(range).toEqual({ from: 3, to: 4 });
  });
});

// =============================================================================
// extractTextWithFormattingFromJson
// =============================================================================

describe("extractTextWithFormattingFromJson", () => {
  /**
   * extractTextWithFormattingFromJson extracts both text AND formatting information.
   *
   * Use this when you need to:
   * - Compare formatting changes between documents
   * - Detect when bold/italic/links were added or removed
   * - Track formatting spans for highlighting
   *
   * Returns: { text: string, formatting: FormattingSpan[] }
   *
   * @example
   * const { text, formatting } = extractTextWithFormattingFromJson(json);
   * // text: "Hello bold world"
   * // formatting: [{ charStart: 6, charEnd: 10, marks: [{ type: "bold" }] }]
   */

  describe("text extraction", () => {
    it("extracts text the same way as extractTextFromJson", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello world" }],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);
      expect(result.text).toBe("Hello world");
    });

    it("handles multi-paragraph documents", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Second" }],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);
      expect(result.text).toBe("First\nSecond");
    });
  });

  describe("formatting span capture", () => {
    it("returns empty formatting array for plain text", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "No formatting here" }],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);
      expect(result.formatting).toHaveLength(0);
    });

    it("captures bold formatting with correct character positions", () => {
      // "Hello [bold] world" - bold is chars 6-10
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Hello " }, // 0-5 (6 chars)
              { type: "text", text: "bold", marks: [{ type: "bold" }] }, // 6-9 (4 chars)
              { type: "text", text: " world" }, // 10-15
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);

      expect(result.text).toBe("Hello bold world");
      expect(result.formatting).toHaveLength(1);
      expect(result.formatting[0]).toEqual({
        charStart: 6,
        charEnd: 10,
        marks: [{ type: "bold" }],
      });
    });

    it("captures multiple formatting spans", () => {
      // "[bold] normal [italic]"
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "bold", marks: [{ type: "bold" }] },
              { type: "text", text: " normal " },
              { type: "text", text: "italic", marks: [{ type: "italic" }] },
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);

      expect(result.text).toBe("bold normal italic");
      expect(result.formatting).toHaveLength(2);

      // First span: bold at start
      expect(result.formatting[0].marks[0].type).toBe("bold");
      expect(result.formatting[0].charStart).toBe(0);
      expect(result.formatting[0].charEnd).toBe(4);

      // Second span: italic at end
      expect(result.formatting[1].marks[0].type).toBe("italic");
      expect(result.formatting[1].charStart).toBe(12);
      expect(result.formatting[1].charEnd).toBe(18);
    });

    it("captures combined marks (bold + italic)", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "bold and italic",
                marks: [{ type: "bold" }, { type: "italic" }],
              },
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);

      expect(result.formatting).toHaveLength(1);
      expect(result.formatting[0].marks).toHaveLength(2);

      const markTypes = result.formatting[0].marks.map((m) => m.type);
      expect(markTypes).toContain("bold");
      expect(markTypes).toContain("italic");
    });

    it("captures link marks with attributes", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "click here",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com", target: "_blank" },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);

      expect(result.formatting).toHaveLength(1);
      expect(result.formatting[0].marks[0].type).toBe("link");
      expect(result.formatting[0].marks[0].attrs?.href).toBe("https://example.com");
    });
  });

  describe("track change mark filtering", () => {
    /**
     * Track change marks (trackInsert, trackDelete, trackFormat) are
     * EXCLUDED from formatting spans. These are internal marks used
     * for the track changes feature, not user-visible formatting.
     */

    it("excludes trackInsert marks", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "inserted text",
                marks: [{ type: "trackInsert", attrs: { id: "123" } }],
              },
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);
      expect(result.formatting).toHaveLength(0);
    });

    it("excludes trackDelete marks", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "deleted text",
                marks: [{ type: "trackDelete", attrs: { id: "456" } }],
              },
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);
      expect(result.formatting).toHaveLength(0);
    });

    it("excludes trackFormat marks but keeps other marks", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "formatted",
                marks: [
                  { type: "bold" }, // Keep this
                  { type: "trackFormat", attrs: { id: "789" } }, // Exclude this
                ],
              },
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);

      expect(result.formatting).toHaveLength(1);
      expect(result.formatting[0].marks).toHaveLength(1);
      expect(result.formatting[0].marks[0].type).toBe("bold");
    });

    it("excludes comment marks", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "commented text",
                marks: [
                  { type: "comment", attrs: { commentId: "c1" } },
                  { type: "commentMark", attrs: { id: "cm1" } },
                ],
              },
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);
      expect(result.formatting).toHaveLength(0);
    });
  });

  describe("multi-paragraph formatting positions", () => {
    it("tracks positions correctly across newlines", () => {
      const doc: ProseMirrorJsonNode = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First" }], // chars 0-4
          },
          // newline at char 5
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Second", marks: [{ type: "bold" }] }, // chars 6-11
            ],
          },
        ],
      };

      const result = extractTextWithFormattingFromJson(doc);

      expect(result.text).toBe("First\nSecond");
      expect(result.formatting).toHaveLength(1);
      // "Second" starts after "First\n" (6 chars)
      expect(result.formatting[0].charStart).toBe(6);
      expect(result.formatting[0].charEnd).toBe(12);
    });
  });
});

// =============================================================================
// Integration Examples
// =============================================================================

describe("Integration: Text Extraction Workflow", () => {
  /**
   * This section demonstrates how the text extraction functions work together
   * in a typical document comparison workflow.
   */

  it("demonstrates comparing two document versions for content changes", () => {
    // Original document
    const original: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };

    // Modified document with new word
    const modified: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello beautiful world" }],
        },
      ],
    };

    // Extract text from both for diff comparison
    const originalText = extractTextFromJson(original);
    const modifiedText = extractTextFromJson(modified);

    expect(originalText).toBe("Hello world");
    expect(modifiedText).toBe("Hello beautiful world");
    // Now these can be passed to computeChangesWithPositions()
  });

  it("demonstrates detecting formatting changes", () => {
    // Original: plain text
    const original: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Important notice" }],
        },
      ],
    };

    // Modified: "Important" is now bold
    const modified: ProseMirrorJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Important", marks: [{ type: "bold" }] },
            { type: "text", text: " notice" },
          ],
        },
      ],
    };

    const originalResult = extractTextWithFormattingFromJson(original);
    const modifiedResult = extractTextWithFormattingFromJson(modified);

    // Text is the same
    expect(originalResult.text).toBe(modifiedResult.text);

    // But formatting differs
    expect(originalResult.formatting).toHaveLength(0);
    expect(modifiedResult.formatting).toHaveLength(1);
    expect(modifiedResult.formatting[0].marks[0].type).toBe("bold");
    // Now these can be passed to computeFormattingChanges()
  });

  it("demonstrates extracting context for deletion positioning", () => {
    // When text is deleted, we need context to find where it was
    const modifiedText = "The fox jumps over the lazy dog.";

    // If "quick brown " was deleted after "The ", we need context
    // Position where deletion occurred: after "The " (position 4)
    const context = extractContext(modifiedText, 4, 20);

    // This context can be used to search in the document
    expect(context).toBe("The");
  });

  it("demonstrates position mapping for editor operations", () => {
    // Simulated position map (would come from extractTextWithPositions in real usage)
    const posMap: PositionMap = {
      text: "Hello world",
      charToPos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    };

    // Get ProseMirror range for "world" (chars 6-11)
    const range = getProseMirrorRange(posMap, 6, 11);

    expect(range).toEqual({ from: 7, to: 12 });
    // This range can be used with editor.commands.setTextSelection({ from: 7, to: 12 })
  });
});
