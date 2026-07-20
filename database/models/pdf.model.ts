import { IPdf } from "@/types";
import { models, Schema, model } from "mongoose";

const PdfSchema = new Schema<IPdf>(
  {
    clerkId: { type: String, required: true },
    title: { type: String, required: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    author: { type: String, required: true },
    persona: { type: String },
    fileURL: { type: String, required: true },
    fileBlobKey: { type: String, required: true },
    coverURL: { type: String },
    coverBlobKey: { type: String },
    fileSize: { type: Number, required: true },
    totalSegments: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const PdfModel =
  models.PdfModel || model<IPdf>("PdfModel", PdfSchema);

export default PdfModel;
