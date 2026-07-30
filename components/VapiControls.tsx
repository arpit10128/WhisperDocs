"use client";

import useVapi from "@/hooks/useVapi";
import { IPdf } from "@/types";
import Transcript from "./Transcript";
import Image from "next/image";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { formatDuration } from "@/lib/utils";

export const VapiControls = ({ pdf }: { pdf: IPdf }) => {
  const {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
    clearErrors,
    limitError,
    // isBillingError,
    maxDurationSeconds,
  } = useVapi(pdf);

  const router = useRouter();

  useEffect(() => {
    if (limitError) {
      toast.error(limitError);
      //   if (isBillingError) {
      //     router.push("/subscriptions");
      //   } else {
      //     router.push("/");
      //   }
      clearErrors();
    }
  }, [limitError, router, clearErrors]); //isBillingError

  const getStatusDisplay = () => {
    switch (status) {
      case "connecting":
        return {
          label: "Connecting...",
          color: "vapi-status-dot-connecting",
        };
      case "starting":
        return {
          label: "Starting...",
          color: "vapi-status-dot-starting",
        };
      case "listening":
        return {
          label: "Listening",
          color: "vapi-status-dot-listening",
        };
      case "thinking":
        return {
          label: "Thinking...",
          color: "vapi-status-dot-thinking",
        };
      case "speaking":
        return {
          label: "Speaking",
          color: "vapi-status-dot-speaking",
        };
      default:
        return {
          label: "Ready",
          color: "vapi-status-dot-ready",
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <div className="vapi-header-card">
        <div className="vapi-cover-wrapper">
          <Image
            src={
              pdf.coverURL || "/images/pdf-placeholder.png"
            }
            alt={pdf.title}
            width={120}
            height={180}
            className="vapi-cover-image !w-[120px] !h-auto"
            priority
          />
          <div className="vapi-mic-wrapper relative">
            {isActive &&
              (status === "speaking" ||
                status === "thinking") && (
                <div className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
              )}
            <button
              onClick={isActive ? stop : start}
              disabled={status === "connecting"}
              className={`vapi-mic-btn shadow-md !w-[60px] !h-[60px] z-10 ${isActive ? "vapi-mic-btn-active" : "vapi-mic-btn-inactive"}`}
            >
              {isActive ? (
                <Mic className="size-7 text-white" />
              ) : (
                <MicOff className="size-7 text-[#212a3b]" />
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 flex-1">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#212a3b] mb-1">
              {pdf.title}
            </h1>
            <p className="text-[#3d485e] font-medium">
              by {pdf.author}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="vapi-status-indicator">
              <span
                className={`vapi-status-dot ${statusDisplay.color}`}
              />
              <span className="vapi-status-text">
                {statusDisplay.label}
              </span>
            </div>

            <div className="vapi-status-indicator">
              <span className="vapi-status-text">
                Voice: {pdf.persona || "Daniel"}
              </span>
            </div>

            <div className="vapi-status-indicator">
              <span className="vapi-status-text">
                {formatDuration(duration)}/
                {formatDuration(maxDurationSeconds)}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="vapi-transcript-wrapper">
        <div className="transcript-container min-h-[400px]">
          <Transcript
            messages={messages}
            currentMessage={currentMessage}
            currentUserMessage={currentUserMessage}
          />
        </div>
      </div>
      ;
    </div>
  );
};
