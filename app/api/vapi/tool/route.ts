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
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_ACCESS_TOKEN_LENGTH = 4_096;

const boundedString = (max: number) => z.string().max(max);

const vapiToolCallsBodySchema = z.object({
  message: z
    .object({
      type: boundedString(100).optional(),
      call: z
        .object({
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
        })
        .optional(),
      toolCallList: z
        .array(
          z.object({
            id: boundedString(MAX_TOOL_CALL_ID_LENGTH).min(
              1,
            ),
            name: boundedString(MAX_TOOL_NAME_LENGTH).min(
              1,
            ),
            arguments: z
              .object({
                query: boundedString(
                  MAX_QUERY_LENGTH,
                ).optional(),
                q: boundedString(
                  MAX_QUERY_LENGTH,
                ).optional(),
                question: boundedString(
                  MAX_QUERY_LENGTH,
                ).optional(),
                pdfId: boundedString(
                  MAX_IDENTIFIER_LENGTH,
                ).optional(),
                documentId: boundedString(
                  MAX_IDENTIFIER_LENGTH,
                ).optional(),
                pdf_id: boundedString(
                  MAX_IDENTIFIER_LENGTH,
                ).optional(),
              })
              .optional(),
          }),
        )
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

async function searchDocument(
  query: string | undefined,
  pdfId: string | undefined,
  documentAccessToken: string | undefined,
): Promise<string> {
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

  if (pdfId && pdfId !== authorizedPdfId) {
    return "I couldn't search the document because the document identifier was unauthorized.";
  }

  if (!query) {
    return "I need a search query to look through the document.";
  }

  try {
    await connectToDatabase();

    const matches = await PdfSegmentModel.find(
      {
        pdfId: authorizedPdfId,
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
    console.error("VAPI_SERVER_SECRET is not configured.");
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 },
    );
  }

  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const bodyResult =
    vapiToolCallsBodySchema.safeParse(parsedBody);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const body = bodyResult.data;
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
        const documentAccessToken = getStringArg(
          body.message?.call?.artifact?.variableValues,
          "documentAccessToken",
        );

        const result = await searchDocument(
          query,
          pdfId,
          documentAccessToken,
        );

        return { toolCallId: toolCall.id, result };
      },
    ),
  );

  return NextResponse.json({ results });
}
