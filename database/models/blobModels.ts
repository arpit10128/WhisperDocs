import { BlobFile } from "@/types";
import { models, Schema, model, Model } from "mongoose";

const blobSchema = new Schema<BlobFile>(
  {
    pdfId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "PdfModel",
      index: true,
    },
    coverUrl: { type: String, required: true },
    pdfUrl: { type: String, required: true },
    ownerId: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "blob",
  },
);

const BlobModel: Model<BlobFile> =
  models.Blob || model<BlobFile>("Blob", blobSchema);

export default BlobModel;
