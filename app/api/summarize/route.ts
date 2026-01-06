import {
  changeSummarySchema,
  openai,
  SUMMARIZE_SYSTEM_PROMPT,
  type SummarizeRequest,
} from "@/app/lib/openai";
import { generateObject } from "ai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body: SummarizeRequest = await request.json();
    const { changes, documentName } = body;

    if (!changes || changes.length === 0) {
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 }
      );
    }

    // Format changes for the LLM
    const changesText = changes
      .map((change, index) => {
        let description = `${index + 1}. [${change.type.toUpperCase()}]`;
        if (change.oldContent) {
          description += ` Changed from: "${change.oldContent}" to: "${change.content}"`;
        } else if (change.type === "deletion") {
          description += ` Removed: "${change.content}"`;
        } else {
          description += ` Added: "${change.content}"`;
        }
        return description;
      })
      .join("\n");

    const userMessage = documentName
      ? `Document: ${documentName}\n\nChanges detected:\n${changesText}`
      : `Changes detected:\n${changesText}`;

    // Use Vercel AI SDK with structured output
    const { object: result } = await generateObject({
      model: openai("gpt-5.2"),
      schema: changeSummarySchema,
      system: SUMMARIZE_SYSTEM_PROMPT,
      prompt: userMessage,
    });

    // Combine all changes into bullet points for easy display
    const bulletPoints = [
      ...result.textChanges,
      ...result.formattingChanges,
      ...result.structuralChanges,
    ];

    return NextResponse.json({
      ...result,
      bulletPoints: bulletPoints.length > 0 ? bulletPoints : [result.overview],
    });
  } catch (error) {
    console.error("Error summarizing changes:", error);

    if (error instanceof Error && error.message.includes("API key")) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to summarize changes" },
      { status: 500 }
    );
  }
}
