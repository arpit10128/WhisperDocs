import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockConnectToDatabase: vi.fn(),
}));

vi.mock("@/database/mongoose", () => ({
  connectToDatabase: mocks.mockConnectToDatabase,
}));

vi.mock("@/database/models/pdfSegment.model", () => ({
  default: {
    find: mocks.mockFind,
  },
}));

import { POST } from "../../app/api/vapi/tool/route";

describe("POST /api/vapi/tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.VAPI_SERVER_SECRET = "test-secret";
  });

  it("returns 401 when the Vapi secret is invalid", async () => {
    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "wrong-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [
              {
                id: "call-1",
                name: "searchDocument",
                arguments: {
                  query: "machine learning",
                  pdfId: "507f1f77bcf86cd799439011",
                },
              },
            ],
          },
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(
      mocks.mockConnectToDatabase,
    ).not.toHaveBeenCalled();
    expect(mocks.mockFind).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: "{invalid-json",
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
  });

  it("returns an empty result when there are no tool calls", async () => {
    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [],
          },
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      results: [],
    });
  });

  it("searches the document and returns matching excerpts", async () => {
    mocks.mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          content:
            "Machine learning allows computers to learn patterns from data.",
          pageNumber: 12,
        },
        {
          content:
            "Supervised learning uses labeled examples to train predictive models.",
          pageNumber: 13,
        },
      ]),
    });

    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [
              {
                id: "call-123",
                name: "searchDocument",
                arguments: {
                  query: "machine learning",
                  pdfId: "507f1f77bcf86cd799439011",
                },
              },
            ],
          },
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);

    expect(
      mocks.mockConnectToDatabase,
    ).toHaveBeenCalledOnce();

    expect(mocks.mockFind).toHaveBeenCalledWith(
      {
        pdfId: "507f1f77bcf86cd799439011",
        $text: {
          $search: "machine learning",
        },
      },
      {
        score: {
          $meta: "textScore",
        },
      },
    );

    const body = await response.json();

    expect(body.results).toHaveLength(1);

    expect(body.results[0].toolCallId).toBe("call-123");

    expect(body.results[0].result).toContain(
      "Machine learning allows computers to learn patterns from data.",
    );

    expect(body.results[0].result).toContain("(page 12)");

    expect(body.results[0].result).toContain(
      "Supervised learning uses labeled examples",
    );
  });

  it("returns a useful message when no matches are found", async () => {
    mocks.mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });

    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [
              {
                id: "call-456",
                name: "searchDocument",
                arguments: {
                  query: "something that does not exist",
                  pdfId: "507f1f77bcf86cd799439011",
                },
              },
            ],
          },
        }),
      },
    );

    const response = await POST(request);

    const body = await response.json();

    expect(body.results[0]).toEqual({
      toolCallId: "call-456",
      result:
        'No relevant passages were found for "something that does not exist" in this document.',
    });
  });

  it("rejects an invalid pdfId without querying MongoDB", async () => {
    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [
              {
                id: "call-invalid",
                name: "searchDocument",
                arguments: {
                  query: "machine learning",
                  pdfId: "not-a-valid-object-id",
                },
              },
            ],
          },
        }),
      },
    );

    const response = await POST(request);

    const body = await response.json();

    expect(mocks.mockFind).not.toHaveBeenCalled();

    expect(body.results[0].result).toContain(
      "document identifier was missing or invalid",
    );
  });

  it("handles searchDocument aliases", async () => {
    mocks.mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          content: "Test document content",
          pageNumber: 1,
        },
      ]),
    });

    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [
              {
                id: "call-alias",
                name: "search_document",
                arguments: {
                  query: "test",
                  pdfId: "507f1f77bcf86cd799439011",
                },
              },
            ],
          },
        }),
      },
    );

    const response = await POST(request);

    const body = await response.json();

    expect(body.results[0].toolCallId).toBe("call-alias");
    expect(body.results[0].result).toContain(
      "Test document content",
    );
  });

  it("returns an error result for an unknown tool", async () => {
    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [
              {
                id: "call-unknown",
                name: "unknownTool",
                arguments: {},
              },
            ],
          },
        }),
      },
    );

    const response = await POST(request);

    const body = await response.json();

    expect(body.results[0]).toEqual({
      toolCallId: "call-unknown",
      result: 'Unknown tool "unknownTool".',
    });

    expect(mocks.mockFind).not.toHaveBeenCalled();
  });

  it("uses the pdfId supplied by Vapi static parameters", async () => {
    mocks.mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          content:
            "The document says testing is important.",
          pageNumber: 4,
        },
      ]),
    });

    const request = new Request(
      "http://localhost/api/vapi/tool",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vapi-secret": "test-secret",
        },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            toolCallList: [
              {
                id: "call-static-pdf",
                name: "searchDocument",
                arguments: {
                  query: "testing",
                  pdfId: "507f1f77bcf86cd799439011",
                },
              },
            ],
          },
        }),
      },
    );

    await POST(request);

    expect(mocks.mockFind).toHaveBeenCalledWith(
      {
        pdfId: "507f1f77bcf86cd799439011",
        $text: {
          $search: "testing",
        },
      },
      {
        score: {
          $meta: "textScore",
        },
      },
    );
  });
});
