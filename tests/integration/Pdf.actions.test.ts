import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getAllPdf,
  checkPdfExists,
  getPdfBySlug,
  createPdf,
  savePdfSegments,
  createBlobFile,
} from "../../lib/action/pdf.actions";

import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import PdfModel from "@/database/models/pdf.model";
import PdfSegmentModel from "@/database/models/pdfSegment.model";
import BlobModel from "@/database/models/blobModels";
import { generateSlug, serializeData } from "@/lib/utils";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/database/mongoose", () => ({
  connectToDatabase: vi.fn(),
}));

// pdf.actions.ts imports this as "../utils" (a relative path). Vitest
// resolves both specifiers to the same absolute file, so mocking it via
// the "@/lib/utils" alias here still intercepts that relative import.
vi.mock("@/lib/utils", () => ({
  generateSlug: vi.fn(),
  serializeData: vi.fn(),
}));

vi.mock("@/database/models/pdf.model", () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

vi.mock("@/database/models/pdfSegment.model", () => ({
  default: {
    insertMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/database/models/blobModels", () => ({
  default: {
    create: vi.fn(),
  },
}));

// Mongoose's real Model<T> type is huge and doesn't match our plain
// vi.fn() factories above, so we cast through `unknown` to a small
// shape we actually use instead of fighting the real types in tests.
type MockFn = ReturnType<typeof vi.fn>;

const mockedAuth = auth as unknown as MockFn;
const mockedConnect =
  connectToDatabase as unknown as MockFn;
const mockedGenerateSlug =
  generateSlug as unknown as MockFn;
const mockedSerializeData =
  serializeData as unknown as MockFn;

const MockedPdfModel = PdfModel as unknown as {
  find: MockFn;
  findOne: MockFn;
  create: MockFn;
  findByIdAndUpdate: MockFn;
  findByIdAndDelete: MockFn;
};

const MockedPdfSegmentModel =
  PdfSegmentModel as unknown as {
    insertMany: MockFn;
    deleteMany: MockFn;
  };

const MockedBlobModel = BlobModel as unknown as {
  create: MockFn;
};

// Helpers that mimic Mongoose's chainable query builder
// (e.g. `Model.find(...).sort(...).lean()`).
const withLean = (resolvedValue: unknown) => ({
  lean: vi.fn().mockResolvedValue(resolvedValue),
});
const withLeanRejected = (error: unknown) => ({
  lean: vi.fn().mockRejectedValue(error),
});
const withSortLean = (resolvedValue: unknown) => ({
  sort: vi.fn(() => withLean(resolvedValue)),
});
const withSortLeanRejected = (error: unknown) => ({
  sort: vi.fn(() => withLeanRejected(error)),
});

beforeEach(() => {
  mockedConnect.mockResolvedValue(undefined);
  mockedSerializeData.mockImplementation(
    (data: unknown) => data,
  );
  mockedGenerateSlug.mockImplementation((title: string) =>
    title.toLowerCase().trim().replace(/\s+/g, "-"),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAllPdf", () => {
  it("returns Unauthorized when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValue({ userId: null });

    const result = await getAllPdf();

    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(MockedPdfModel.find).not.toHaveBeenCalled();
  });

  it("returns the signed-in user's PDFs sorted newest first", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const fakePdfs = [{ _id: "1", title: "Book A" }];
    MockedPdfModel.find.mockReturnValue(
      withSortLean(fakePdfs),
    );

    const result = await getAllPdf();

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(MockedPdfModel.find).toHaveBeenCalledWith({
      clerkId: "user_1",
    });
    expect(result).toEqual({
      success: true,
      data: fakePdfs,
    });
  });

  it("returns success: false when the database call fails", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const dbError = new Error("Mongo is down");
    MockedPdfModel.find.mockReturnValue(
      withSortLeanRejected(dbError),
    );

    const result = await getAllPdf();

    expect(result).toEqual({
      success: false,
      error: dbError,
    });
  });
});

describe("checkPdfExists", () => {
  it("returns Unauthorized when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValue({ userId: null });

    const result = await checkPdfExists("Clean Code");

    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
  });

  it("reports alreadyExists: true when a matching PDF exists for the user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const existingPdf = { _id: "1", slug: "clean-code" };
    MockedPdfModel.findOne.mockReturnValue(
      withLean(existingPdf),
    );

    const result = await checkPdfExists("Clean Code");

    expect(mockedGenerateSlug).toHaveBeenCalledWith(
      "Clean Code",
    );
    expect(MockedPdfModel.findOne).toHaveBeenCalledWith({
      slug: "clean-code",
      clerkId: "user_1",
    });
    expect(result).toEqual({
      success: true,
      data: existingPdf,
      alreadyExists: true,
    });
  });

  it("reports alreadyExists: false when no PDF matches", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfModel.findOne.mockReturnValue(withLean(null));

    const result = await checkPdfExists("New Book");

    expect(result).toEqual({
      success: true,
      data: null,
      alreadyExists: false,
    });
  });

  it("returns success: false when the database call fails", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const dbError = new Error("Mongo is down");
    MockedPdfModel.findOne.mockReturnValue(
      withLeanRejected(dbError),
    );

    const result = await checkPdfExists("Clean Code");

    expect(result).toEqual({
      success: false,
      error: dbError,
    });
  });
});

describe("getPdfBySlug", () => {
  it("returns Unauthorized when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValue({ userId: null });

    const result = await getPdfBySlug("clean-code");

    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
  });

  it("scopes the lookup to the current user and returns the PDF", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const fakePdf = { _id: "1", slug: "clean-code" };
    MockedPdfModel.findOne.mockReturnValue(
      withLean(fakePdf),
    );

    const result = await getPdfBySlug("clean-code");

    expect(MockedPdfModel.findOne).toHaveBeenCalledWith({
      slug: "clean-code",
      clerkId: "user_1",
    });
    expect(result).toEqual({
      success: true,
      data: fakePdf,
    });
  });

  it("returns 'Book not found' when no PDF matches for this user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfModel.findOne.mockReturnValue(withLean(null));

    const result = await getPdfBySlug("someone-elses-book");

    expect(result).toEqual({
      success: false,
      error: "Book not found",
    });
  });

  it("returns the Error message when the database call throws an Error", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfModel.findOne.mockReturnValue(
      withLeanRejected(new Error("Mongo is down")),
    );

    const result = await getPdfBySlug("clean-code");

    expect(result).toEqual({
      success: false,
      error: "Mongo is down",
    });
  });

  it("falls back to 'Unknown error' for non-Error throws", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfModel.findOne.mockReturnValue(
      withLeanRejected("boom"),
    );

    const result = await getPdfBySlug("clean-code");

    expect(result).toEqual({
      success: false,
      error: "Unknown error",
    });
  });
});

describe("createPdf", () => {
  const newPdfData = {
    title: "Clean Code",
    author: "Robert C. Martin",
    fileURL: "https://blob/clean-code.pdf",
    fileBlobKey: "users/user_1/clean-code.pdf",
    fileSize: 1024,
  };

  it("returns Unauthorized when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValue({ userId: null });

    const result = await createPdf(newPdfData);

    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(MockedPdfModel.create).not.toHaveBeenCalled();
  });

  it("short-circuits and returns the existing PDF instead of creating a duplicate", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const existingPdf = { _id: "1", slug: "clean-code" };
    MockedPdfModel.findOne.mockReturnValue(
      withLean(existingPdf),
    );

    const result = await createPdf(newPdfData);

    expect(MockedPdfModel.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: existingPdf,
      alreadyExists: true,
    });
  });

  it("creates a new PDF scoped to the current user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfModel.findOne.mockReturnValue(withLean(null));
    const createdPdf = {
      _id: "2",
      ...newPdfData,
      slug: "clean-code",
    };
    MockedPdfModel.create.mockResolvedValue(createdPdf);

    const result = await createPdf(newPdfData);

    expect(MockedPdfModel.create).toHaveBeenCalledWith({
      ...newPdfData,
      clerkId: "user_1",
      slug: "clean-code",
      totalSegments: 0,
    });
    expect(result).toEqual({
      success: true,
      data: createdPdf,
    });
  });

  it("returns success: false when creation fails", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfModel.findOne.mockReturnValue(withLean(null));
    const dbError = new Error("Duplicate slug");
    MockedPdfModel.create.mockRejectedValue(dbError);

    const result = await createPdf(newPdfData);

    expect(result).toEqual({
      success: false,
      error: dbError,
    });
  });
});

describe("savePdfSegments", () => {
  const segments = [
    { text: "First chunk", segmentIndex: 0, wordCount: 2 },
    { text: "Second chunk", segmentIndex: 1, wordCount: 2 },
  ];

  it("returns Unauthorized when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValue({ userId: null });

    const result = await savePdfSegments("pdf_1", segments);

    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(
      MockedPdfSegmentModel.insertMany,
    ).not.toHaveBeenCalled();
  });

  it("inserts segments and updates the PDF's totalSegments", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfSegmentModel.insertMany.mockResolvedValue(
      undefined,
    );
    MockedPdfModel.findByIdAndUpdate.mockResolvedValue({});

    const result = await savePdfSegments("pdf_1", segments);

    expect(
      MockedPdfSegmentModel.insertMany,
    ).toHaveBeenCalledWith([
      {
        clerkId: "user_1",
        pdfId: "pdf_1",
        content: "First chunk",
        segmentIndex: 0,
        pageNumber: undefined,
        wordCount: 2,
      },
      {
        clerkId: "user_1",
        pdfId: "pdf_1",
        content: "Second chunk",
        segmentIndex: 1,
        pageNumber: undefined,
        wordCount: 2,
      },
    ]);
    expect(
      MockedPdfModel.findByIdAndUpdate,
    ).toHaveBeenCalledWith("pdf_1", {
      totalSegments: 2,
    });
    expect(result).toEqual({
      success: true,
      data: { segmentsCreated: 2 },
    });
  });

  it("rolls back the segments and the PDF when saving fails", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const dbError = new Error("Insert failed");
    MockedPdfSegmentModel.insertMany.mockRejectedValue(
      dbError,
    );
    MockedPdfSegmentModel.deleteMany.mockResolvedValue(
      undefined,
    );
    MockedPdfModel.findByIdAndDelete.mockResolvedValue(
      undefined,
    );

    const result = await savePdfSegments("pdf_1", segments);

    expect(
      MockedPdfSegmentModel.deleteMany,
    ).toHaveBeenCalledWith({
      pdfId: "pdf_1",
    });
    expect(
      MockedPdfModel.findByIdAndDelete,
    ).toHaveBeenCalledWith("pdf_1");
    expect(result).toEqual({
      success: false,
      error: dbError,
    });
  });
});

describe("createBlobFile", () => {
  it("returns Unauthorized when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValue({ userId: null });

    const result = await createBlobFile("pdf_1");

    expect(result).toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(MockedBlobModel.create).not.toHaveBeenCalled();
  });

  it("returns Forbidden when the PDF does not belong to the user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    MockedPdfModel.findOne.mockResolvedValue(null);

    const result = await createBlobFile("pdf_1");

    expect(MockedPdfModel.findOne).toHaveBeenCalledWith({
      _id: "pdf_1",
      clerkId: "user_1",
    });
    expect(result).toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(MockedBlobModel.create).not.toHaveBeenCalled();
  });

  it("creates the blob metadata record for an owned PDF", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const pdf = {
      _id: "pdf_1",
      coverURL: "https://blob/cover.png",
      fileURL: "https://blob/file.pdf",
    };
    MockedPdfModel.findOne.mockResolvedValue(pdf);
    const createdBlob = { ...pdf, _id: "blob_1" }; //Change
    MockedBlobModel.create.mockResolvedValue(createdBlob);

    const result = await createBlobFile("pdf_1");

    expect(MockedBlobModel.create).toHaveBeenCalledWith({
      pdfId: pdf._id,
      coverUrl: pdf.coverURL,
      pdfUrl: pdf.fileURL,
      ownerId: "user_1",
    });
    expect(result).toEqual({
      success: true,
      data: createdBlob,
    });
  });

  it("rolls back the PDF and its segments when blob creation fails", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" });
    const pdf = {
      _id: "pdf_1",
      coverURL: "https://blob/cover.png",
      fileURL: "https://blob/file.pdf",
    };
    MockedPdfModel.findOne.mockResolvedValue(pdf);
    const dbError = new Error("Blob write failed");
    MockedBlobModel.create.mockRejectedValue(dbError);
    MockedPdfSegmentModel.deleteMany.mockResolvedValue(
      undefined,
    );
    MockedPdfModel.findByIdAndDelete.mockResolvedValue(
      undefined,
    );

    const result = await createBlobFile("pdf_1");

    expect(
      MockedPdfSegmentModel.deleteMany,
    ).toHaveBeenCalledWith({
      pdfId: "pdf_1",
    });
    expect(
      MockedPdfModel.findByIdAndDelete,
    ).toHaveBeenCalledWith("pdf_1");
    expect(result).toEqual({
      success: false,
      error: dbError,
    });
  });
});
