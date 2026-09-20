import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import PdfModel from "../../../database/models/pdf.model";

let mongoServer: MongoMemoryServer;

const createPdf = (overrides = {}) => ({
  clerkId: "user_123",
  title: "Clean Code",
  slug: "clean-code",
  author: "Robert C. Martin",
  fileURL: "https://example.com/clean-code.pdf",
  fileBlobKey: "books/clean-code.pdf",
  fileSize: 1024,
  totalSegments: 10,
  ...overrides,
});

describe("PdfModel", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    await mongoose.connect(mongoServer.getUri());

    // Make sure the compound unique index exists
    await PdfModel.createIndexes();
  });

  afterEach(async () => {
    await PdfModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("should create a PDF successfully", async () => {
    const pdf = await PdfModel.create(createPdf());

    expect(pdf.clerkId).toBe("user_123");
    expect(pdf.title).toBe("Clean Code");
    expect(pdf.slug).toBe("clean-code");
  });

  it("should not allow the same slug for the same user", async () => {
    await PdfModel.create(
      createPdf({
        clerkId: "user_123",
        slug: "clean-code",
      }),
    );

    await expect(
      PdfModel.create(
        createPdf({
          clerkId: "user_123",
          slug: "clean-code",
        }),
      ),
    ).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("should allow the same slug for different users", async () => {
    await PdfModel.create(
      createPdf({
        clerkId: "user_123",
        slug: "clean-code",
      }),
    );

    const pdf = await PdfModel.create(
      createPdf({
        clerkId: "user_456",
        slug: "clean-code",
      }),
    );

    expect(pdf.clerkId).toBe("user_456");
    expect(pdf.slug).toBe("clean-code");
  });

  it("should lowercase the slug", async () => {
    const pdf = await PdfModel.create(
      createPdf({
        slug: "Clean-Code",
      }),
    );

    expect(pdf.slug).toBe("clean-code");
  });

  it("should trim whitespace from the slug", async () => {
    const pdf = await PdfModel.create(
      createPdf({
        slug: "  clean-code  ",
      }),
    );

    expect(pdf.slug).toBe("clean-code");
  });

  it("should require clerkId", async () => {
    const pdf = new PdfModel(
      createPdf({
        clerkId: undefined,
      }),
    );

    await expect(pdf.validate()).rejects.toThrow();
  });

  it("should require title", async () => {
    const pdf = new PdfModel(
      createPdf({
        title: undefined,
      }),
    );

    await expect(pdf.validate()).rejects.toThrow();
  });

  it("should require slug", async () => {
    const pdf = new PdfModel(
      createPdf({
        slug: undefined,
      }),
    );

    await expect(pdf.validate()).rejects.toThrow();
  });

  it("should require author", async () => {
    const pdf = new PdfModel(
      createPdf({
        author: undefined,
      }),
    );

    await expect(pdf.validate()).rejects.toThrow();
  });

  it("should require fileURL", async () => {
    const pdf = new PdfModel(
      createPdf({
        fileURL: undefined,
      }),
    );

    await expect(pdf.validate()).rejects.toThrow();
  });

  it("should require fileBlobKey", async () => {
    const pdf = new PdfModel(
      createPdf({
        fileBlobKey: undefined,
      }),
    );

    await expect(pdf.validate()).rejects.toThrow();
  });

  it("should require fileSize", async () => {
    const pdf = new PdfModel(
      createPdf({
        fileSize: undefined,
      }),
    );

    await expect(pdf.validate()).rejects.toThrow();
  });

  it("should default totalSegments to 0", async () => {
    const pdf = await PdfModel.create(
      createPdf({
        totalSegments: undefined,
      }),
    );

    expect(pdf.totalSegments).toBe(0);
  });
});
