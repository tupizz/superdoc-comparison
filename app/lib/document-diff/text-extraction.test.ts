/**
 * Unit tests for text extraction utilities
 */

import { describe, it, expect } from "vitest";
import {
  extractTextFromJson,
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
