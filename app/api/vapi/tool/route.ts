import { connectToDatabase } from "@/database/mongoose";
import PdfSegmentModel from "@/database/models/pdfSegment.model";
import { verifyVapiDocumentToken } from "@/lib/vapi-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

const MAX_RESULTS = 5;
const MAX_SNIPPET_LENGTH = 800;
const MAX_TOOL_CALLS = 20;
const MAX_TOOL_CALL_ID_LENGTH = 256;
const MAX_TOOL_NAME_LENGTH = 100;
const MAX_QUERY_LENGTH = 2_000;
const MAX_ACCESS_TOKEN_LENGTH = 4_096;

const boundedString = (max: number) => z.string().max(max);

const toolCallSchema = z.object({
  id: boundedString(MAX_TOOL_CALL_ID_LENGTH).min(1),

  type: boundedString(100).optional(),

  function: z
    .object({
      name: boundedString(MAX_TOOL_NAME_LENGTH).min(1),

      arguments: z
        .union([
          z.record(z.string(), z.unknown()),
          boundedString(
            MAX_QUERY_LENGTH + MAX_ACCESS_TOKEN_LENGTH,
          ),
        ])
        .optional(),
    })
    .optional(),
});

const vapiToolCallsBodySchema = z.object({
  message: z
    .object({
      type: boundedString(100).optional(),

      artifact: z
        .object({
          variableValues: z
            .object({
              documentAccessToken: boundedString(
                MAX_ACCESS_TOKEN_LENGTH,
              ).optional(),
            })
            .optional(),
        })
        .optional(),

      toolCallList: z
        .array(toolCallSchema)
        .max(MAX_TOOL_CALLS)
        .optional(),
    })
    .optional(),
});

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

function parseArguments(
  argumentsValue:
    | Record<string, unknown>
    | string
    | undefined,
): Record<string, unknown> | undefined {
  if (!argumentsValue) {
    return undefined;
  }

  if (typeof argumentsValue === "object") {
    return argumentsValue;
  }

  try {
    const parsed = JSON.parse(argumentsValue);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

async function searchDocument(
  query: string | undefined,
  documentAccessToken: string | undefined,
): Promise<string> {
  if (!query) {
    return "I need a search query to look through the document.";
  }

  const access = verifyVapiDocumentToken(
    documentAccessToken,
  );

  const authorizedPdfId = access?.pdfId;

  if (
    !authorizedPdfId ||
    !Types.ObjectId.isValid(authorizedPdfId)
  ) {
    return "I couldn't search the document because the document identifier was missing or invalid.";
  }

  try {
    await connectToDatabase();

    const matches = await PdfSegmentModel.find(
      {
        pdfId: authorizedPdfId,
        $text: { $search: query },
      },
      {
        score: { $meta: "textScore" },
      },
    )
      .sort({
        score: { $meta: "textScore" },
      })
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
            ? `${segment.content.slice(
                0,
                MAX_SNIPPET_LENGTH,
              )}...`
            : segment.content;

        return `Excerpt ${index + 1}${pageInfo}:\n${snippet}`;
      })
      .join("\n\n");
  } catch (error) {
    console.error(
      "Error running $text search over pdf segments",
      error,
    );

    return "Something went wrong while searching the document. Please try again.";
  }
}

export async function POST(request: Request) {
  const configuredSecret = process.env.VAPI_SERVER_SECRET;

  if (!configuredSecret) {
    console.error("VAPI_SERVER_SECRET is not configured.");

    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 },
    );
  }

  const incomingSecret =
    request.headers.get("x-vapi-secret");

  if (incomingSecret !== configuredSecret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
    console.log(
      "VAPI TOOL BODY:",
      JSON.stringify(parsedBody, null, 2),
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const bodyResult =
    vapiToolCallsBodySchema.safeParse(parsedBody);

  if (!bodyResult.success) {
    console.error(
      "VAPI schema validation failed:",
      bodyResult.error.flatten(),
    );

    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const body = bodyResult.data;

  const toolCallList = body.message?.toolCallList ?? [];

  if (toolCallList.length === 0) {
    return NextResponse.json({
      results: [],
    });
  }

  const artifactToken =
    body.message?.artifact?.variableValues
      ?.documentAccessToken;

  const results: ToolResult[] = await Promise.all(
    toolCallList.map(
      async (toolCall): Promise<ToolResult> => {
        const functionName = toolCall.function?.name;

        if (
          !functionName ||
          !SEARCH_TOOL_NAMES.has(functionName.toLowerCase())
        ) {
          return {
            toolCallId: toolCall.id,
            result: `Unknown tool "${functionName ?? "unknown"}".`,
          };
        }

        const args = parseArguments(
          toolCall.function?.arguments,
        );

        console.log("VAPI TOOL ARGS:", args);

        const query = getStringArg(
          args,
          "query",
          "q",
          "question",
        );

        const documentAccessToken =
          getStringArg(args, "documentAccessToken") ??
          artifactToken;

        console.log("QUERY:", query);
        console.log(
          "HAS DOCUMENT TOKEN:",
          Boolean(documentAccessToken),
        );

        const result = await searchDocument(
          query,
          documentAccessToken,
        );

        return {
          toolCallId: toolCall.id,
          result,
        };
      },
    ),
  );

  return NextResponse.json({
    results,
  });
}
