import { IPdfSegment } from "@/types";
import { models, Schema, model } from "mongoose";

const PdfSegmentSchema = new Schema<IPdfSegment>(
  {
    clerkId: { type: String, required: true },
    pdfId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "BookModel",
      index: true,
    },
    content: { type: String, required: true },
    segmentIndex: {
      type: Number,
      required: true,
      index: true,
    },
    pageNumber: { type: Number, index: true },
    wordCount: { type: Number, required: true },
  },
  { timestamps: true },
);

// schema.index() creates database indexes to speed up queries and enforce constraints.

// Compound indexes (pdfId + segmentIndex/pageNumber) optimize lookups, while a text index (content: "text") enables fast full-text search.

PdfSegmentSchema.index(
  { pdfId: 1, segmentIndex: 1 },
  { unique: true },
);
PdfSegmentSchema.index({ pdfId: 1, pageNumber: 1 });

PdfSegmentSchema.index({ pdfId: 1, content: "text" });

const PdfSegmentModel =
  models.PdfSegmentModel ||
  model<IPdfSegment>("PdfSegmentModel", PdfSegmentSchema);

export default PdfSegmentModel;
