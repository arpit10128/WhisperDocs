"use server";

import { connectToDatabase } from "@/database/mongoose";
import { CreatePdf, TextSegment } from "@/types";
import { generateSlug, serializeData } from "../utils";
import PdfModel from "@/database/models/pdf.model";
import PdfSegmentModel from "@/database/models/bookSegment.model";
import { auth } from "@clerk/nextjs/server";
import BlobModel from "@/database/models/blobModels";

export const getAllPdf = async () => {
  try {
    await connectToDatabase();

    const pdfs = await PdfModel.find()
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      data: serializeData(pdfs),
    };
  } catch (e) {
    return {
      success: false,
      error: e,
    };
  }
};

export const checkPdfExists = async (title: string) => {
  try {
    await connectToDatabase();

    const slug = generateSlug(title);

    const existingPdf = await PdfModel.findOne({
      slug,
    }).lean();

    if (existingPdf) {
      return {
        success: true,
        data: serializeData(existingPdf),
        alreadyExists: true,
      };
    }

    return {
      success: true,
      data: null,
      alreadyExists: false,
    };
  } catch (e) {
    console.error("Error checking if PDF exists", e);

    return {
      success: false,
      error: e,
    };
  }
};

export const createPdf = async (data: CreatePdf) => {
  try {
    await connectToDatabase();

    const { userId } = await auth();

    if (!userId) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const existsResult = await checkPdfExists(data.title);
    if (existsResult.alreadyExists) {
      return existsResult;
    }

    // Todo: check subscription limits before creating a PDF
    const slug = generateSlug(data.title);

    const pdf = await PdfModel.create({
      ...data,
      clerkId: userId,
      slug,
      totalSegments: 0,
    });

    return {
      success: true,
      data: serializeData(pdf),
    };
  } catch (e) {
    console.error("Error creating a PDF", e);

    return {
      success: false,
      error: e,
    };
  }
};

export const savePdfSegments = async (
  pdfId: string,
  segments: TextSegment[],
) => {
  try {
    await connectToDatabase();

    const { userId } = await auth();

    if (!userId) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    console.log("saving pdf segments...");

    const segmentsToInsert = segments.map(
      ({ text, segmentIndex, pageNumber, wordCount }) => ({
        clerkId: userId,
        pdfId,
        content: text,
        segmentIndex,
        pageNumber,
        wordCount,
      }),
    );

    await PdfSegmentModel.insertMany(segmentsToInsert);

    await PdfModel.findByIdAndUpdate(pdfId, {
      totalSegments: segments.length,
    });

    console.log("Pdf segments saved successfully");

    return {
      success: true,
      data: { segmentsCreated: segments.length },
    };
  } catch (e) {
    console.error("Error saving pdf segments", e);

    // if we can't save pdf segments, remove any partial state
    await PdfSegmentModel.deleteMany({ pdfId });
    await PdfModel.findByIdAndDelete(pdfId);

    console.log(
      "Deleted pdf segments and PDF due to failure saving segments",
    );

    return {
      success: false,
      error: e,
    };
  }
};

export const createBlobFile = async (pdfId: string) => {
  try {
    await connectToDatabase();

    const { userId } = await auth();

    if (!userId) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const pdf = await PdfModel.findOne({
      _id: pdfId,
      clerkId: userId,
    });

    if (pdf === null) {
      return {
        success: false,
        error: "Forbidden",
      };
    }

    const blobFiles = await BlobModel.create({
      pdfId: pdf._id,
      coverUrl: pdf.coverURL,
      pdfUrl: pdf.fileURL,
      ownerId: userId,
    });

    return {
      success: true,
      data: serializeData(blobFiles),
    };
  } catch (e) {
    console.error("Error creating a blob file", e);

    await PdfSegmentModel.deleteMany({ pdfId });
    await PdfModel.findByIdAndDelete(pdfId);

    console.log(
      "Rolled back PDF and segments because blob metadata creation failed.",
    );

    return {
      success: false,
      error: e,
    };
  }
};
