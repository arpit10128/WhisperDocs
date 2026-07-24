import BlobModel from "@/database/models/blobModels";
import PdfModel from "@/database/models/pdf.model";
import PdfSegmentModel from "@/database/models/bookSegment.model";
import { connectToDatabase } from "@/database/mongoose";
import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

interface DeleteBlobBody {
  blobId: string;
}

export async function DELETE(request: Request) {
  try {
    const database = await connectToDatabase();
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { blobId }: DeleteBlobBody = await request.json();

    //check whether the blodId we get is valid or not.
    if (
      typeof blobId !== "string" ||
      !Types.ObjectId.isValid(blobId)
    ) {
      return NextResponse.json(
        { error: "Invalid blobId" },
        { status: 400 },
      );
    }

    const blobUser = await BlobModel.findById(blobId);

    if (!blobUser) {
      return NextResponse.json(
        { error: "Missing blob identifier" },
        { status: 404 },
      );
    }

    if (blobUser.ownerId !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    const session = await database.startSession();
    try {
      await session.withTransaction(async () => {
        const pdf = await PdfModel.findOne({
          _id: blobUser.pdfId,
          clerkId: userId,
        }).session(session);

        if (pdf) {
          await PdfSegmentModel.deleteMany({
            pdfId: blobUser.pdfId,
          }).session(session);
          await PdfModel.deleteOne({
            _id: pdf._id,
          }).session(session);
        }

        await BlobModel.deleteOne({
          _id: blobUser._id,
        }).session(session);
      });

      await del([blobUser.coverUrl, blobUser.pdfUrl]);
    } finally {
      await session.endSession();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Blob delete error", error);
    return NextResponse.json(
      { error: "Failed to delete blob" },
      { status: 500 },
    );
  }
}
