import {
  changeSummarySchema,
  openai,
  SUMMARIZE_SYSTEM_PROMPT,
  type SummarizeRequest,
} from "@/app/lib/openai";
import { streamObject } from "ai";
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

    // Use Vercel AI SDK with streaming structured output
    const result = streamObject({
      model: openai("gpt-5.2"),
      schema: changeSummarySchema,
      system: SUMMARIZE_SYSTEM_PROMPT,
      prompt: userMessage,
    });

    // Create a stream that sends partial objects as NDJSON
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream partial objects as they're generated
          for await (const partialObject of result.partialObjectStream) {
            const jsonLine = JSON.stringify(partialObject) + "\n";
            controller.enqueue(encoder.encode(jsonLine));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
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
