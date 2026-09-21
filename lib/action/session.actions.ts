"use server";

import VoiceSession from "@/database/models/voiceSession.model";
import { connectToDatabase } from "@/database/mongoose";
import {
  EndSessionResult,
  StartSessionResult,
} from "@/types";
import { auth } from "@clerk/nextjs/server";
import { getCurrentBillingPeriodStart } from "../subscription-constants";
import { createVapiDocumentToken } from "../vapi-auth";
import PdfModel from "@/database/models/pdf.model";

export const startVoiceSession = async (
  pdfId: string,
): Promise<StartSessionResult> => {
  try {
    await connectToDatabase();

    const { userId } = await auth();

    if (!userId) {
      return {
        success: false,
        error: "Please login to start a conversation",
      };
    }

    const pdf = await PdfModel.findOne({
      _id: pdfId,
      clerkId: userId,
    }).lean();

    if (!pdf) {
      return {
        success: false,
        error: "Forbidden action.",
      };
    }

    //Limits/Plan to see whether session is allowed

    const session = await VoiceSession.create({
      clerkId: userId,
      pdfId,
      startedAt: new Date(),
      billingPeriodStart: getCurrentBillingPeriodStart(),
      durationSeconds: 0,
    });

    return {
      success: true,
      sessionId: session._id.toString(),
      documentAccessToken: createVapiDocumentToken(
        pdfId,
        userId,
      ),
      //maxDurationMinutes: check.maxDurationMinutes,
    };
  } catch (e) {
    console.error("Error startinf voice session ", e);
    return {
      success: false,
      error:
        "Failed to start voice session. Please try again later.",
    };
  }
};

export const endVoiceSession = async (
  sessionId: string,
): Promise<EndSessionResult> => {
  try {
    await connectToDatabase();

    const { userId } = await auth();

    if (!userId) {
      return {
        success: false,
        error: "Please login to start a conversation",
      };
    }

    const session = await VoiceSession.findOne({
      _id: sessionId,
      clerkId: userId,
    });

    if (!session) {
      return {
        success: false,
        error: "Forbidden action.",
      };
    }

    const res = await VoiceSession.findByIdAndUpdate(
      sessionId,
      {
        endedAt: new Date(),
        durationSeconds: Math.floor(
          (Date.now() - session.startedAt.getTime()) / 1000,
        ),
      },
    );

    if (!res) {
      return {
        success: false,
        error: "Voice session not found.",
      };
    }

    return {
      success: true,
    };
  } catch (e) {
    console.error("Error ending voice session", e);
    return {
      success: false,
      error:
        "Failed to end voice session. Please try again later.",
    };
  }
};
