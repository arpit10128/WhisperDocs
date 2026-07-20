import { IVoiceSession } from "@/types";
import { models, Schema, model } from "mongoose";

const VoiceSessionSchema = new Schema<IVoiceSession>(
  {
    clerkId: { type: String, required: true, index: true },
    pdfId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "BookModel",
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endedAt: { type: Date },
    durationSeconds: {
      type: Number,
      default: 0,
      required: true,
    },
    billingPeriodStart: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

VoiceSessionSchema.index({
  clerkId: 1,
  billingPeriodStart: 1,
});

const VoiceSessionModel =
  models.VoiceSessionModel ||
  model<IVoiceSession>(
    "VoiceSessionModel",
    VoiceSessionSchema,
  );

export default VoiceSessionModel;
