# Document Diff Library

Utilities for comparing DOCX documents and applying track changes using SuperDoc/ProseMirror.

## Why Custom Types (`SuperDocEditor`) Instead of SuperDoc's `Editor` Type?

SuperDoc exports an `Editor` type, but its key properties are typed as `any`:

```typescript
// From @harbour-enterprises/superdoc types
export type Editor = {
  readonly state: any;      // Should be EditorState
  get commands(): any;      // Should be typed commands
  chain(): any;             // Should be ChainedCommand
  getJSON(): any;           // Should be ProseMirrorJsonNode
  // ... many more `any` types
};
```

### The Problem

Using SuperDoc's `Editor` type directly means we lose all type safety for ProseMirror operations:

```typescript
// With SuperDoc's Editor type - no type checking
const editor: Editor = superdoc.activeEditor;
editor.state.doc.descendants(...);  // `state` is `any`, no autocomplete, no errors
editor.view.dispatch(tr);           // `view` doesn't exist on the type
```

### Our Solution

We define `SuperDocEditor` with **real ProseMirror types**:

```typescript
// From our types.ts
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import type { Schema } from "prosemirror-model";

export interface SuperDocEditor {
  readonly view: EditorView;      // Real ProseMirror type!
  readonly state: EditorState;    // Real ProseMirror type!
  readonly schema: Schema;        // Real ProseMirror type!
  // ...
}
```

This gives us:
- Full autocomplete for ProseMirror APIs
- Type errors when we misuse the API
- Documentation on hover
- Refactoring support

### The Trade-off: `as unknown as` Cast

Since SuperDoc's runtime type doesn't match our interface at compile time, we need a cast at the boundary:

```typescript
const editor = superdoc.activeEditor as unknown as SuperDocEditor;
```

This is intentional and safe because:
1. SuperDoc's editor IS a ProseMirror editor at runtime
2. The cast only happens at the boundary (in DocumentComparison.tsx)
3. All our utility code gets full type safety

### Why Not Just Use `any`?

Using `any` would be simpler but loses all benefits:

```typescript
// BAD: No type safety anywhere
const editor: any = superdoc.activeEditor;
editor.state.doc.descendants((node) => {  // node is `any`
  node.isText  // Could be wrong, no error
});
```

Our approach keeps type safety inside all utility functions while accepting one explicit cast at the integration point.

## Usage

```typescript
import {
  extractTextFromJson,
  extractTextWithPositions,
  computeChangesWithPositions,
  applyTrackChanges,
  type SuperDocEditor,
} from "@/app/lib/document-diff";

// Cast at the boundary
const editor = superdoc.activeEditor as unknown as SuperDocEditor;

// Full type safety from here on
const posMap = extractTextWithPositions(editor);
const changes = computeChangesWithPositions(originalText, posMap.text);
const result = applyTrackChanges(editor, changes, posMap);
```
