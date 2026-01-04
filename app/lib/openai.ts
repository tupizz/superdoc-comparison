import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'

// Initialize OpenAI provider for Vercel AI SDK
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// System prompt for summarizing document changes
export const SUMMARIZE_SYSTEM_PROMPT = `You are a document analyst. Given a list of tracked changes between two versions of a document, provide a clear, concise summary of what changed.

Analyze the changes and provide:
1. A brief one-sentence overview of what changed
2. Categorized lists of specific changes (text changes, formatting changes, structural changes)
3. Focus on the substance of the changes, not technical details
4. Be specific about what was added, removed, or modified
5. Keep the summary professional and easy to understand`

// Zod schema for structured output
export const changeSummarySchema = z.object({
  overview: z.string().describe('A brief one-sentence overview of the main changes'),
  textChanges: z.array(z.string()).describe('List of text content changes (additions, deletions, modifications)'),
  formattingChanges: z.array(z.string()).describe('List of formatting changes (bold, italic, font changes, etc.)'),
  structuralChanges: z.array(z.string()).describe('List of structural changes (paragraphs added/removed, sections reorganized)'),
  summary: z.string().describe('A human-readable summary paragraph explaining all the changes'),
})

export type ChangeSummaryOutput = z.infer<typeof changeSummarySchema>

// Type for the summarize request
export interface SummarizeRequest {
  changes: Array<{
    type: string
    content: string
    oldContent?: string
  }>
  documentName?: string
}

// Type for the summarize response (matches structured output)
export interface SummarizeResponse extends ChangeSummaryOutput {
  bulletPoints: string[]
}
