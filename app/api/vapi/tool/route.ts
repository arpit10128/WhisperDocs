import { connectToDatabase } from "@/database/mongoose";
import PdfSegmentModel from "@/database/models/pdfSegment.model";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

const MAX_RESULTS = 5;
const MAX_SNIPPET_LENGTH = 800;

interface VapiToolCall {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
}

interface VapiToolCallsBody {
  message?: {
    type?: string;
    toolCallList?: VapiToolCall[];
  };
}

interface ToolResult {
  toolCallId: string;
  result: string;
}

const SEARCH_TOOL_NAMES = new Set([
  "searchdocument",
  "search_document",
]);

function getStringArg(
  args: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!args) return undefined;

  for (const key of keys) {
    const value = args[key];
    if (
      typeof value === "string" &&
      value.trim().length > 0
    ) {
      return value.trim();
    }
  }

  return undefined;
}

async function searchDocument(
  query: string | undefined,
  pdfId: string | undefined,
): Promise<string> {
  if (!pdfId || !Types.ObjectId.isValid(pdfId)) {
    return "I couldn't search the document because the document identifier was missing or invalid.";
  }

  if (!query) {
    return "I need a search query to look through the document.";
  }

  try {
    await connectToDatabase();

    const matches = await PdfSegmentModel.find(
      {
        pdfId,
        $text: { $search: query },
      },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(MAX_RESULTS)
      .lean();

    if (matches.length === 0) {
      return `No relevant passages were found for "${query}" in this document.`;
    }

    return matches
      .map((segment, index) => {
        const pageInfo =
          typeof segment.pageNumber === "number"
            ? ` (page ${segment.pageNumber})`
            : "";
        const snippet =
          segment.content.length > MAX_SNIPPET_LENGTH
            ? `${segment.content.slice(0, MAX_SNIPPET_LENGTH)}...`
            : segment.content;

        return `Excerpt ${index + 1}${pageInfo}:\n${snippet}`;
      })
      .join("\n\n");
  } catch (e) {
    console.error(
      "Error running $text search over pdf segments",
      e,
    );
    return "Something went wrong while searching the document. Please try again.";
  }
}

export async function POST(request: Request) {
  // Vapi sends back whatever "secret" was configured on the tool's
  // server block as this header. Since this route has to be public
  // (no Clerk session on a server-to-server webhook), this is the
  // auth boundary. See proxy.ts for the matcher change.
  const configuredSecret = process.env.VAPI_SERVER_SECRET;

  if (configuredSecret) {
    const incomingSecret =
      request.headers.get("x-vapi-secret");
    if (incomingSecret !== configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
  } else {
    console.warn(
      "VAPI_SERVER_SECRET is not set — /api/vapi/tool is unauthenticated.",
    );
  }

  let body: VapiToolCallsBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const toolCallList = body.message?.toolCallList ?? [];

  if (toolCallList.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results: ToolResult[] = await Promise.all(
    toolCallList.map(
      async (toolCall): Promise<ToolResult> => {
        if (
          !SEARCH_TOOL_NAMES.has(
            toolCall.name?.toLowerCase(),
          )
        ) {
          return {
            toolCallId: toolCall.id,
            result: `Unknown tool "${toolCall.name}".`,
          };
        }

        const query = getStringArg(
          toolCall.arguments,
          "query",
          "q",
          "question",
        );
        const pdfId = getStringArg(
          toolCall.arguments,
          "pdfId",
          "documentId",
          "pdf_id",
        );

        const result = await searchDocument(query, pdfId);

        return { toolCallId: toolCall.id, result };
      },
    ),
  );

  return NextResponse.json({ results });
}
