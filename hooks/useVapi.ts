import {
  endVoiceSession,
  startVoiceSession,
} from "@/lib/action/session.actions";
import {
  ASSISTANT_ID,
  DEFAULT_VOICE,
  VOICE_SETTINGS,
} from "@/lib/constants";
import { IPdf, Messages } from "@/types";
import { useAuth } from "@clerk/nextjs";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Vapi from "@vapi-ai/web";
import { getVoice } from "@/lib/utils";

export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export type CallStatus =
  | "idle"
  | "connecting"
  | "starting"
  | "listening"
  | "thinking"
  | "speaking";

const VAPI_API_KEY = process.env.NEXT_PUBLIC_VAPI_API_KEY;
const TIME_INTERVAL_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const TIME_WARNING_THRESHOLD = 60;

let vapi: InstanceType<typeof Vapi>;

function getVapi() {
  if (!vapi) {
    if (!VAPI_API_KEY) {
      throw new Error(
        "NEXT_PUBLIC_VAPI_API_KEY not found.",
      );
    }

    vapi = new Vapi(VAPI_API_KEY);
  }

  return vapi;
}

export const useVapi = (pdf: IPdf) => {
  const { userId } = useAuth();
  // const { limits } = useSubscription();

  const [status, setStatus] = useState<CallStatus>("idle");
  const [messages, setMessages] = useState<Messages[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [currentUserMessage, setCurrentUserMessage] =
    useState("");
  const [duration, setDuration] = useState(0);
  const [limitError, setLimitError] = useState<
    string | null
  >(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isStoppingRef = useRef<boolean>(false);

  //keeping ref in sync with the latest value
  const maxDurationSeconds = 1 * 60; //limits?.maxDurationPerSession ? limits.maxDurationPerSession * 60 : (1 * 60);
  const maxDurationRef = useLatestRef(maxDurationSeconds);
  const durationRef = useLatestRef(duration);
  const voice = pdf.persona || DEFAULT_VOICE;

  //set up vapi event listeners

  useEffect(() => {
    const handlers = {
      /*
        Timeline
        Call Running───▶ speech-start───▶ Speaking───▶ speech-end───▶ Listening───▶ User clicks Stop───▶ isStoppingRef = true───▶ Call is ending...───▶ Vapi sends delayed speech-end───▶ Ignored (isStoppingRef === true)───▶ call-end───▶ Idle
        Vapi is event-driven, so calling vapi.stop() doesn't immediately stop all pending events. Some queued events may still arrive after the stop request. 
        isStoppingRef acts as a guard, ignoring those delayed events so the UI doesn't incorrectly switch back to "Speaking" or "Listening" after the call has ended.
      */
      "call-start": () => {
        isStoppingRef.current = false;
        setStatus("starting");
        setCurrentMessage("");
        setCurrentUserMessage("");

        //start duration timer
        startTimeRef.current = Date.now();
        setDuration(0);
        timerRef.current = setInterval(() => {
          if (startTimeRef.current) {
            const newDuration = Math.floor(
              (Date.now() - startTimeRef.current) /
                TIME_INTERVAL_MS,
            );
            setDuration(newDuration);

            //check duration limit
            if (
              newDuration >= maxDurationRef.current &&
              !isStoppingRef.current
            ) {
              getVapi().stop();
              isStoppingRef.current = true;
              setLimitError(
                `Session time limit (${Math.floor(
                  maxDurationRef.current /
                    SECONDS_PER_MINUTE,
                )} minutes) reached. Upgrade your plan for longer sessions.`,
              );
            }
          }
        }, TIME_INTERVAL_MS);
      },

      "call-end": () => {
        setStatus("idle");
        setCurrentMessage("");
        setCurrentUserMessage("");

        //stopping timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // End session tracking
        if (sessionIdRef.current) {
          endVoiceSession(sessionIdRef.current).catch(
            (err) =>
              console.error(
                "Failed to end voice session:",
                err,
              ),
          );
          sessionIdRef.current = null;
        }
      },

      "speech-start": () => {
        if (!isStoppingRef.current) {
          setStatus("speaking");
        }
      },

      "speech-end": () => {
        if (!isStoppingRef.current) {
          setStatus("listening");
        }
      },

      message: (message: {
        type: string;
        role: string;
        transcriptType: string;
        transcript: string;
      }) => {
        if (message.type !== "transcript") return;

        //user finished speaking and now Ai is thinking
        if (
          message.role === "user" &&
          message.transcriptType === "final"
        ) {
          if (!isStoppingRef.current) {
            setStatus("thinking");
          }
          setCurrentUserMessage("");
        }

        //partial user transcript -> show real time typing
        //While the user is still talking, Vapi continuously sends partial transcripts.
        if (
          message.role === "user" &&
          message.transcriptType === "partial"
        ) {
          setCurrentUserMessage(message.transcript);
          return;
        }

        //partial Ai transcript -> show word by word
        //As the AI speaks, Vapi also sends partial transcripts.
        if (
          message.role === "assistant" &&
          message.transcriptType === "partial"
        ) {
          setCurrentMessage(message.transcript);
          return;
        }

        //final transcript -> add to messages
        if (message.transcriptType === "final") {
          if (message.role === "user")
            setCurrentUserMessage("");
          if (message.role === "assistant")
            setCurrentMessage("");

          //Instead of using the current messages variable, React gives you the latest state as prev.
          setMessages((prev) => {
            //checking whether the same message already exists.
            //Sometimes Vapi may emit the same final transcript more than once
            const isDupe = prev.some(
              (m) =>
                m.role === message.role &&
                m.content === message.transcript,
            );

            return isDupe
              ? prev
              : [
                  ...prev, //...prev copies all existing messages:
                  {
                    role: message.role,
                    content: message.transcript,
                  }, //and then appends the new one:
                ];
          });
        }
      },

      error: (error: Error) => {
        console.error("Vapi error:", error);

        setStatus("idle");
        setCurrentMessage("");
        setCurrentUserMessage("");

        //stopping timer on error
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        //End session tracking on error
        if (sessionIdRef.current) {
          endVoiceSession(sessionIdRef.current).catch(
            (err) =>
              console.error(
                "Failed to end voice session on error:",
                err,
              ),
          );
          sessionIdRef.current = null;
        }

        //show user friendly error message
        const errorMessage =
          error.message?.toLowerCase() || "";
        if (
          errorMessage.includes("timeout") ||
          errorMessage.includes("silence")
        ) {
          setLimitError(
            "Session ended due to inactivity. Click the mic to start again.",
          );
        } else if (
          errorMessage.includes("network") ||
          errorMessage.includes("connection")
        ) {
          setLimitError(
            "Connection lost. Please check your internet and try again.",
          );
        } else {
          setLimitError(
            "Session ended unexpectedly. Click the mic to start again.",
          );
        }

        startTimeRef;
      },
    };

    //Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      getVapi().on(
        event as keyof typeof handlers,
        handler as () => void,
      );
    });

    return () => {
      //end active session on unmount
      if (sessionIdRef.current) {
        getVapi().stop();
        endVoiceSession(sessionIdRef.current).catch((err) =>
          console.error(
            "Failed to end voice session on unmount:",
            err,
          ),
        );
        sessionIdRef.current = null;
      }

      // Cleanup handlers
      Object.entries(handlers).forEach(
        ([event, handler]) => {
          getVapi().off(
            event as keyof typeof handlers,
            handler as () => void,
          );
        },
      );
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const isActive =
    status === "listening" ||
    status === "thinking" ||
    status === "speaking" ||
    status === "starting";

  //Limits
  //  const maxDurationSeconds =
  // const maxDurationRef = useLatestRef(resourceLimits.maxSessionSeconds * 60);
  // const remainingSeconds
  // const showTimeWarning

  const start = useCallback(async () => {
    if (!userId)
      return setLimitError(
        "Please login to start a conversation",
      );

    setLimitError(null);
    setStatus("connecting");

    try {
      const res = await startVoiceSession(pdf._id);

      if (!res.success) {
        setLimitError(
          res.error ||
            "Session limit reached. Please upgrade your plan.",
        );
        setStatus("idle");
        return;
      }

      sessionIdRef.current = res.sessionId || null;

      const firstMessage = `Hey, good to meet you. Before we dive in: have you actually read ${pdf.title} yet? or are we starting fresh?`;

      await getVapi().start(ASSISTANT_ID, {
        firstMessage,
        variableValues: {
          title: pdf.title,
          author: pdf.author,
          pdfId: pdf._id,
        },
        voice: {
          provider: "11labs" as const,
          voiceId: getVoice(voice).id,
          model: "eleven_turbo_v2_5" as const,
          stability: VOICE_SETTINGS.stability,
          similarityBoost: VOICE_SETTINGS.similarityBoost,
          style: VOICE_SETTINGS.style,
          useSpeakerBoost: VOICE_SETTINGS.useSpeakerBoost,
        },
      });
    } catch (e) {
      console.error("Error starting call ", e);
      setStatus("idle");
      setLimitError(
        "An error occured while starting the call",
      );
    }
  }, [pdf._id, pdf.title, pdf.author, voice, userId]);

  const stop = useCallback(() => {
    isStoppingRef.current = true;
    getVapi().stop();
  }, []);

  const clearErrors = useCallback(() => {
    setLimitError(null);
    // setIsBillingError(false);
  }, []);

  return {
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
    //remainingSeconds, showTimeWarning
  };
};

export default useVapi;
