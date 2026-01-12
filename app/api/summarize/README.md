# AI Summary API - Streaming Implementation

This document explains how the `/api/summarize` endpoint works, including the streaming architecture for real-time AI responses.

## Overview

The summarize API endpoint uses the Vercel AI SDK with OpenAI to generate structured summaries of document changes. The key feature is **streaming** - the response is sent progressively as the AI generates it, providing a better user experience.

## Endpoint

```
POST /api/summarize
```

## Request

### Headers
```
Content-Type: application/json
```

### Body
```typescript
interface SummarizeRequest {
  changes: Array<{
    type: "insertion" | "deletion" | "replacement";
    content: string;
    oldContent?: string;  // Only for replacements
  }>;
  documentName?: string;  // Optional, helps AI understand context
}
```

### Example Request
```json
{
  "changes": [
    {
      "type": "replacement",
      "content": "30 days",
      "oldContent": "14 days"
    },
    {
      "type": "insertion",
      "content": "including weekends and holidays"
    },
    {
      "type": "deletion",
      "content": "Subject to manager approval"
    }
  ],
  "documentName": "Employee_Handbook_v2.docx"
}
```

## Response

### Streaming Format: NDJSON

The response uses **NDJSON (Newline-Delimited JSON)** format. Each line is a complete JSON object representing the current state of the generated summary.

```
Content-Type: application/x-ndjson
Transfer-Encoding: chunked
```

### How Streaming Works

```
Time →

Line 1: {"documentContext":"This appears to be..."}
Line 2: {"documentContext":"This appears to be an employee handbook...","overview":"Several"}
Line 3: {"documentContext":"...","overview":"Several policy changes were made..."}
Line 4: {"documentContext":"...","overview":"...","textChanges":["Extended notice"]}
Line 5: {"documentContext":"...","overview":"...","textChanges":["Extended notice period","Added clarification"]}
...
Final:  {complete object with all fields populated}
```

Each line contains a **progressively more complete object**. The client can parse each line and update the UI immediately, showing content as it's generated.

### Response Schema

```typescript
interface SummarizeResponse {
  documentContext: string;      // 1 paragraph describing the document type
  overview: string;             // 1 sentence summary of changes
  textChanges: string[];        // Bullet points of text changes
  formattingChanges: string[];  // Bullet points of formatting changes
  structuralChanges: string[];  // Bullet points of structural changes
  summary: string;              // 2-3 sentence takeaway
  bulletPoints: string[];       // Combined array (added by client)
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  1. POST /api/summarize with changes                          │  │
│  │  2. Read response as stream                                    │  │
│  │  3. Parse each NDJSON line                                     │  │
│  │  4. Update UI with partial object                              │  │
│  │  5. Repeat until stream ends                                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      /api/summarize                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  1. Parse request body                                         │  │
│  │  2. Format changes for LLM                                     │  │
│  │  3. Call streamObject() with Zod schema                        │  │
│  │  4. Iterate partialObjectStream                                │  │
│  │  5. Write each partial object as NDJSON line                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenAI API                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Model: gpt-5.2                                                │  │
│  │  Mode: Structured output with Zod schema                       │  │
│  │  Streaming: Enabled via partialObjectStream                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Server Side (route.ts)

```typescript
import { streamObject } from "ai";

// Start streaming structured generation
const result = streamObject({
  model: openai("gpt-5.2"),
  schema: changeSummarySchema,  // Zod schema for type safety
  system: SUMMARIZE_SYSTEM_PROMPT,
  prompt: userMessage,
});

// Create NDJSON stream
const stream = new ReadableStream({
  async start(controller) {
    for await (const partialObject of result.partialObjectStream) {
      const jsonLine = JSON.stringify(partialObject) + "\n";
      controller.enqueue(encoder.encode(jsonLine));
    }
    controller.close();
  },
});

return new Response(stream, {
  headers: { "Content-Type": "application/x-ndjson" },
});
```

### Client Side (DocumentComparison.tsx)

```typescript
const response = await fetch("/api/summarize", { ... });
const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });

  // Process complete lines (NDJSON)
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";  // Keep incomplete line

  for (const line of lines) {
    if (line.trim()) {
      const partialObject = JSON.parse(line);
      setAiSummary(partialObject);  // Update UI immediately
    }
  }
}
```

## Why NDJSON?

| Format | Pros | Cons |
|--------|------|------|
| **NDJSON** | Easy to parse line-by-line, works with any HTTP client | Slightly larger payload |
| Server-Sent Events | Built-in browser support | More complex server setup |
| WebSocket | Bidirectional | Overkill for request-response |

NDJSON was chosen for simplicity - it's just JSON with newlines, requiring no special client libraries.

## Error Handling

### HTTP Errors

| Status | Description |
|--------|-------------|
| 400 | No changes provided in request |
| 500 | OpenAI API key not configured |
| 500 | Failed to summarize changes (general error) |

### Stream Errors

If an error occurs during streaming, the stream will be terminated. The client should handle incomplete streams gracefully (the UI will show whatever data was received before the error).

## Configuration

### Environment Variables

```env
OPENAI_API_KEY=sk-your-api-key-here
```

### Model Configuration

The model is configured in `app/lib/openai.ts`:

```typescript
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### System Prompt

The AI is prompted to be concise:

```
You are a document analyst. Summarize document changes BRIEFLY.

Rules:
- Be extremely concise. Use short phrases, not full sentences.
- Document context: 1 paragraph max
- Overview: 1 short sentence
- Each change item: max 8-10 words
- Summary: 3-5 sentences max
- Skip obvious or minor changes
- Group similar changes together
- No redundancy between sections
```

## Testing

### Manual Testing

```bash
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"type": "insertion", "content": "New paragraph added"},
      {"type": "deletion", "content": "Old text removed"}
    ],
    "documentName": "test.docx"
  }'
```

### Viewing Stream in Browser

Open DevTools → Network → Select the request → Response tab shows the streamed data.

## Performance

- **First byte**: ~500-1000ms (time to first streamed content)
- **Total time**: Depends on response length, typically 2-5 seconds
- **Perceived performance**: Much better than waiting for complete response

The streaming approach significantly improves perceived performance because users see content appearing immediately rather than staring at a loading spinner.
