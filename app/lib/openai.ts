import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

// Initialize OpenAI provider for Vercel AI SDK
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for summarizing document changes
export const SUMMARIZE_SYSTEM_PROMPT = `You are a document analyst. Summarize document changes BRIEFLY.

Rules:
- Be extremely concise. Use short phrases, not full sentences.
- Document context: 1 paragraph max
- Overview: 1 short sentence
- Each change item: max 8-10 words
- Summary: 3-5 sentences max
- Skip obvious or minor changes
- Group similar changes together
- No redundancy between sections`;

// Zod schema for structured output
export const changeSummarySchema = z.object({
  documentContext: z
    .string()
    .describe(
      "1 paragraph: document type and purpose. Explain the document in a way that is easy to understand. Do not mention the document name."
    ),
  overview: z.string().describe("1 short sentence: what changed overall"),
  textChanges: z
    .array(z.string())
    .describe(
      "Short bullet points (max 8-10 words each). Only significant text changes."
    ),
  formattingChanges: z
    .array(z.string())
    .describe("Short bullet points. Only if notable formatting changes exist."),
  structuralChanges: z
    .array(z.string())
    .describe("Short bullet points. Only major structural changes."),
  summary: z
    .string()
    .describe("2-3 sentences max. Key takeaways for reviewer."),
});

export type ChangeSummaryOutput = z.infer<typeof changeSummarySchema>;

// Type for the summarize request
export interface SummarizeRequest {
  changes: Array<{
    type: string;
    content: string;
    oldContent?: string;
  }>;
  documentName?: string;
}

// Type for the summarize response (matches structured output)
export interface SummarizeResponse extends ChangeSummaryOutput {
  bulletPoints: string[];
}
