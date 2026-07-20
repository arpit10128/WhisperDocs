import { TextSegment } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_VOICE, voiceOptions } from "./constants";
import { PDFPageProxy } from "pdfjs-dist";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Serialize Mongoose documents to plain JSON objects (strips ObjectId, Date, etc.)
export const serializeData = <T>(data: T): T =>
  JSON.parse(JSON.stringify(data));

// Auto generate slug
export function generateSlug(text: string): string {
  return text
    .replace(/\.[^/.]+$/, "") // Remove file extension (.pdf, .txt, etc.)
    .toLowerCase() // Convert to lowercase
    .trim() // Remove whitespace from both ends
    .replace(/[^\w\s-]/g, "") // Remove special characters (keep letters, numbers, spaces, hyphens)
    .replace(/[\s_]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

// Escape regex special characters to prevent ReDoS attacks
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Splits text content into segments for MongoDB storage and search
export const splitIntoSegments = (
  text: string,
  segmentSize: number = 500, // Maximum words per segment
  overlapSize: number = 50, // Words to overlap between segments for context
): TextSegment[] => {
  // Validate parameters to prevent infinite loops
  if (segmentSize <= 0) {
    throw new Error("segmentSize must be greater than 0");
  }
  if (overlapSize < 0 || overlapSize >= segmentSize) {
    throw new Error(
      "overlapSize must be >= 0 and < segmentSize",
    );
  }

  const words = text
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const segments: TextSegment[] = [];

  let segmentIndex = 0;
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = Math.min(
      startIndex + segmentSize,
      words.length,
    );
    const segmentWords = words.slice(startIndex, endIndex);
    const segmentText = segmentWords.join(" ");

    segments.push({
      text: segmentText,
      segmentIndex,
      wordCount: segmentWords.length,
    });

    segmentIndex++;

    if (endIndex >= words.length) break;
    startIndex = endIndex - overlapSize;
  }

  return segments;
};

// Get voice data by persona key or voice ID
export const getVoice = (persona?: string) => {
  if (!persona) return voiceOptions[DEFAULT_VOICE];

  // Find by voice ID
  const voiceEntry = Object.values(voiceOptions).find(
    (v) => v.id === persona,
  );
  if (voiceEntry) return voiceEntry;

  // Find by key
  const voiceByKey =
    voiceOptions[persona as keyof typeof voiceOptions];
  if (voiceByKey) return voiceByKey;

  // Default fallback
  return voiceOptions[DEFAULT_VOICE];
};

// Format duration in seconds to MM:SS format
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export async function parsePDFFile(file: File) {
  const pdfjsLib = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  // Helper to extract text from a page
  const extractPageText = async (
    page: PDFPageProxy,
  ): Promise<string> => {
    const textContent = await page.getTextContent();

    return textContent.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");
  };

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  let loadingTask:
    | ReturnType<typeof pdfjsLib.getDocument>
    | undefined;
  let pdfDocument:
    | Awaited<
        ReturnType<typeof pdfjsLib.getDocument>["promise"]
      >
    | undefined;

  try {
    // Load PDF
    loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
    });

    pdfDocument = await loadingTask.promise;

    if (pdfDocument.numPages === 0) {
      throw new Error("PDF contains no pages.");
    }

    // Load first page once
    const firstPage = await pdfDocument.getPage(1);

    // Render cover image
    const viewport = firstPage.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not get canvas context");
    }

    await firstPage.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise;

    // Convert first page to PNG
    const coverDataURL = canvas.toDataURL("image/png");

    // Release canvas memory
    canvas.width = 0;
    canvas.height = 0;

    // Extract text from all pages
    let fullText = "";

    fullText += (await extractPageText(firstPage)) + "\n";
    firstPage.cleanup();

    for (
      let pageNum = 2;
      pageNum <= pdfDocument.numPages;
      pageNum++
    ) {
      const page = await pdfDocument.getPage(pageNum);

      fullText += (await extractPageText(page)) + "\n";

      page.cleanup();
    }

    return {
      content: splitIntoSegments(fullText),
      cover: coverDataURL,
    };
  } catch (error) {
    console.error("Error parsing PDF:", error);

    throw new Error(
      `Failed to parse PDF file: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  } finally {
    // Always clean up resources
    if (pdfDocument) {
      pdfDocument.cleanup();
    }

    if (loadingTask) {
      loadingTask.destroy();
    }
  }
}
