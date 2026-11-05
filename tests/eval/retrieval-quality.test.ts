/**
 * Retrieval quality evaluation harness for the searchDocument tool used by
 * app/api/vapi/tool/route.ts (backed by PdfSegmentModel + MongoDB $text
 * search).
 *
 * This is not a plain pass/fail unit test - it's a benchmark. It seeds a
 * small, hand-labeled "golden" document into a real MongoDB (via
 * mongodb-memory-server, the same tool tests/integration/*.test.ts already
 * use) and fires the exact production code path - the real POST handler -
 * with a batch of representative queries. It then scores the results the
 * way an information-retrieval system normally gets scored:
 *
 *   - Hit Rate@5   ("recall")  - was a relevant chunk anywhere in the top 5?
 *   - Precision@5              - of the chunks returned, how many were relevant?
 *   - MRR                      - how high did the first relevant chunk rank?
 *   - Top-1 accuracy           - was the single best chunk actually first?
 *   - Negative-query handling  - does it correctly say "nothing found"
 *                                 instead of returning an unrelated chunk?
 *
 * Run it with:
 *   npx vitest run tests/eval/retrieval-quality.test.ts
 * or
 *   npm run test:run -- tests/eval/retrieval-quality.test.ts
 *
 * First run downloads a MongoDB binary for mongodb-memory-server, so make
 * sure you have network access and give it a minute.
 *
 * The console output prints a full scorecard, per category and overall, as
 * a 0-100 score. The categories deliberately separate "the easy case"
 * (query words appear verbatim in the source) from the cases that actually
 * matter for a voice assistant - paraphrases, conversational/filler
 * speech, and out-of-scope questions. Since MongoDB's $text search is a
 * keyword/stemming index rather than a semantic one, expect a real gap
 * between "exact" and everything else - that gap *is* the "poor
 * accuracy/quality/relevance" you're seeing, now measurable.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import PdfSegmentModel from "@/database/models/pdfSegment.model";
import { createVapiDocumentToken } from "@/lib/vapi-auth";

// ---------------------------------------------------------------------------
// Golden corpus - a small fictional gym-membership handbook. Each segment
// mirrors what a real chunk out of splitIntoSegments() looks like: a few
// sentences of prose. Every segment ends with a unique, made-up token
// (never a real English word) so we can tell, purely from the tool's
// plain-text response, exactly which segment(s) it returned - without
// touching the database.
// ---------------------------------------------------------------------------

interface GoldSegment {
  marker: string;
  segmentIndex: number;
  pageNumber: number;
  content: string;
}

const SEGMENTS: GoldSegment[] = [
  {
    marker: "XREFUND",
    segmentIndex: 0,
    pageNumber: 4,
    content:
      "Refunds are processed within 14 business days after a cancellation request is approved. The original payment method is credited automatically once processing completes. XREFUND",
  },
  {
    marker: "XFREEZE",
    segmentIndex: 1,
    pageNumber: 5,
    content:
      "Members may freeze their membership for up to three consecutive months per calendar year due to travel, injury, or relocation. A freeze request must be submitted at least five days in advance. XFREEZE",
  },
  {
    marker: "XGUEST",
    segmentIndex: 2,
    pageNumber: 6,
    content:
      "Each member receives two complimentary guest passes per month. Guests must be accompanied by the member at all times and sign a liability waiver at the front desk. XGUEST",
  },
  {
    marker: "XPT",
    segmentIndex: 3,
    pageNumber: 8,
    content:
      "Personal training sessions can be purchased in packages of 5, 10, or 20 sessions. Unused sessions expire twelve months after the purchase date. XPT",
  },
  {
    marker: "XCLASS",
    segmentIndex: 4,
    pageNumber: 9,
    content:
      "Group fitness classes can be reserved up to seven days in advance through the mobile app. A ten dollar no-show fee applies if a reserved spot is not cancelled at least two hours before class. XCLASS",
  },
  {
    marker: "XDRESS",
    segmentIndex: 5,
    pageNumber: 10,
    content:
      "Closed-toe athletic shoes are required on the gym floor at all times. Tank tops are permitted, but shirts must be worn in all areas outside the locker rooms. XDRESS",
  },
  {
    marker: "XLOCKER",
    segmentIndex: 6,
    pageNumber: 10,
    content:
      "Day lockers are available on a first-come basis and must be emptied by closing time. Overnight locker rentals are available for an additional monthly fee. XLOCKER",
  },
  {
    marker: "XPARKING",
    segmentIndex: 7,
    pageNumber: 11,
    content:
      "Members receive two hours of complimentary validated parking in the attached garage. Additional time is billed at the garage's standard hourly rate. XPARKING",
  },
  {
    marker: "XKIDS",
    segmentIndex: 8,
    pageNumber: 12,
    content:
      "The Kids Club is available for children ages 2 to 10 during staffed hours, Monday through Saturday, from 8am to 1pm. A valid membership QR code is required at check-in. XKIDS",
  },
  {
    marker: "XAED",
    segmentIndex: 9,
    pageNumber: 13,
    content:
      "In a medical emergency, staff will call 911 immediately and use the nearest automated external defibrillator, located next to the front desk and near the pool. XAED",
  },
  {
    marker: "XTIERS",
    segmentIndex: 10,
    pageNumber: 3,
    content:
      "The Silver tier includes access to a single home club. The Gold tier adds access to every club nationwide plus two guest passes each month. The Platinum tier adds unlimited guest passes and two personal training sessions monthly. XTIERS",
  },
  {
    marker: "XNUTRITION",
    segmentIndex: 11,
    pageNumber: 14,
    content:
      "One complimentary nutrition consultation is included with Gold and Platinum memberships. Additional sessions can be booked for a flat fee with a registered dietitian. XNUTRITION",
  },
  {
    marker: "XCANCEL",
    segmentIndex: 12,
    pageNumber: 4,
    content:
      "Membership cancellations require 30 days written notice submitted through the member portal or in person at the front desk. Cancelling mid billing cycle does not entitle the member to a refund for that month. XCANCEL",
  },
  {
    marker: "XTOWEL",
    segmentIndex: 13,
    pageNumber: 10,
    content:
      "Fresh towels are available at the towel station near the locker rooms at no additional charge. Members are asked to return used towels to the designated bins. XTOWEL",
  },
];

const ALL_MARKERS = SEGMENTS.map((s) => s.marker);

// ---------------------------------------------------------------------------
// Golden query set. `relevantMarkers` lists every segment that would count
// as a correct answer (some real questions legitimately have more than one
// relevant passage). `primaryMarker` is the single best passage, used for
// the top-1-accuracy check. Negative queries have no relevant markers - the
// correct behavior is an empty / "nothing found" response.
// ---------------------------------------------------------------------------

type Category =
  | "exact"
  | "paraphrase"
  | "conversational"
  | "distractor"
  | "negative";

interface GoldQuery {
  id: string;
  category: Category;
  query: string;
  relevantMarkers: string[];
  primaryMarker?: string;
}

const QUERIES: GoldQuery[] = [
  // -- exact: the query reuses the document's own vocabulary ---------------
  {
    id: "exact-refund",
    category: "exact",
    query: "How many business days does a refund take?",
    relevantMarkers: ["XREFUND", "XCANCEL"],
    primaryMarker: "XREFUND",
  },
  {
    id: "exact-guest",
    category: "exact",
    query: "Can I bring a guest to the gym?",
    relevantMarkers: ["XGUEST", "XTIERS"],
    primaryMarker: "XGUEST",
  },
  {
    id: "exact-noshow",
    category: "exact",
    query:
      "What's the no-show fee for missing a reserved class?",
    relevantMarkers: ["XCLASS"],
    primaryMarker: "XCLASS",
  },
  {
    id: "exact-shoes",
    category: "exact",
    query: "What shoes do I need to wear on the gym floor?",
    relevantMarkers: ["XDRESS"],
    primaryMarker: "XDRESS",
  },
  {
    id: "exact-aed",
    category: "exact",
    query: "Where is the defibrillator located?",
    relevantMarkers: ["XAED"],
    primaryMarker: "XAED",
  },

  // -- paraphrase: same intent, different vocabulary ------------------------
  {
    id: "paraphrase-freeze",
    category: "paraphrase",
    query:
      "If I need to pause my membership for a while because I'm traveling, is that allowed?",
    relevantMarkers: ["XFREEZE"],
    primaryMarker: "XFREEZE",
  },
  {
    id: "paraphrase-cancel",
    category: "paraphrase",
    query: "I want to quit the gym, what do I need to do?",
    relevantMarkers: ["XCANCEL"],
    primaryMarker: "XCANCEL",
  },
  {
    id: "paraphrase-childcare",
    category: "paraphrase",
    query:
      "Is there someone who can watch my kid while I work out?",
    relevantMarkers: ["XKIDS"],
    primaryMarker: "XKIDS",
  },
  {
    id: "paraphrase-diet",
    category: "paraphrase",
    query: "Do you offer any diet or eating advice?",
    relevantMarkers: ["XNUTRITION"],
    primaryMarker: "XNUTRITION",
  },

  // -- conversational: filler words, the way a voice transcript reads -------
  {
    id: "conversational-noshow",
    category: "conversational",
    query:
      "um yeah so like quick question uh what happens if I don't show up for a class I booked",
    relevantMarkers: ["XCLASS"],
    primaryMarker: "XCLASS",
  },
  {
    id: "conversational-parking",
    category: "conversational",
    query:
      "okay so um can you tell me like where I'm supposed to park and if it's free or whatever",
    relevantMarkers: ["XPARKING"],
    primaryMarker: "XPARKING",
  },
  {
    id: "conversational-kids",
    category: "conversational",
    query:
      "hey so uh my kid, is there like childcare or something while I'm working out",
    relevantMarkers: ["XKIDS"],
    primaryMarker: "XKIDS",
  },

  // -- distractor: two legitimately-related chunks share the same keywords -
  {
    id: "distractor-guest-passes",
    category: "distractor",
    query:
      "How many guest passes come with the Gold membership?",
    relevantMarkers: ["XTIERS", "XGUEST"],
    primaryMarker: "XTIERS",
  },
  {
    id: "distractor-pt-expiry",
    category: "distractor",
    query: "Do personal training sessions expire?",
    relevantMarkers: ["XPT", "XTIERS"],
    primaryMarker: "XPT",
  },

  // -- negative: nothing in the handbook answers these ----------------------
  {
    id: "negative-wifi",
    category: "negative",
    query: "What's the wifi password for the gym?",
    relevantMarkers: [],
  },
  {
    id: "negative-protein",
    category: "negative",
    query: "Do you sell protein shakes at the front desk?",
    relevantMarkers: [],
  },
  {
    id: "negative-pool-hours",
    category: "negative",
    query:
      "What time does the swimming pool open on Sundays?",
    relevantMarkers: [],
  },
  {
    id: "negative-clean",
    category: "negative",
    query: "What's your policy on tattoos in the sauna?",
    relevantMarkers: [],
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface QueryScore {
  id: string;
  category: Category;
  returned: string[];
  hit: boolean;
  precisionAt5: number;
  reciprocalRank: number;
  top1Correct: boolean | null; // null when there's no primaryMarker (negative queries)
  falsePositive: boolean; // only meaningful for negative queries
}

function markersInRankOrder(resultText: string): string[] {
  if (!resultText || !resultText.includes("Excerpt"))
    return [];

  const excerpts = resultText
    .split(/(?=Excerpt \d+)/g)
    .filter((chunk) => chunk.trim().length > 0);

  const found: string[] = [];
  for (const excerpt of excerpts) {
    const marker = ALL_MARKERS.find((m) =>
      excerpt.includes(m),
    );
    if (marker) found.push(marker);
  }
  return found;
}

function scoreQuery(
  q: GoldQuery,
  rawResults: Map<string, string>,
): QueryScore {
  const resultText = rawResults.get(q.id) ?? "";
  const returned = markersInRankOrder(resultText);

  if (q.category === "negative") {
    return {
      id: q.id,
      category: q.category,
      returned,
      hit: returned.length === 0,
      precisionAt5: returned.length === 0 ? 1 : 0,
      reciprocalRank: returned.length === 0 ? 1 : 0,
      top1Correct: null,
      falsePositive: returned.length > 0,
    };
  }

  const relevantHits = returned.filter((m) =>
    q.relevantMarkers.includes(m),
  );
  const firstRelevantRank = returned.findIndex((m) =>
    q.relevantMarkers.includes(m),
  );

  return {
    id: q.id,
    category: q.category,
    returned,
    hit: relevantHits.length > 0,
    precisionAt5:
      returned.length === 0
        ? 0
        : relevantHits.length / returned.length,
    reciprocalRank:
      firstRelevantRank === -1
        ? 0
        : 1 / (firstRelevantRank + 1),
    top1Correct: q.primaryMarker
      ? returned[0] === q.primaryMarker
      : null,
    falsePositive: false,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function summarize(scores: QueryScore[]) {
  const positive = scores.filter(
    (s) => s.category !== "negative",
  );
  const negative = scores.filter(
    (s) => s.category === "negative",
  );

  const hitRate = average(
    positive.map((s) => (s.hit ? 1 : 0)),
  );
  const precision = average(
    positive.map((s) => s.precisionAt5),
  );
  const mrr = average(
    positive.map((s) => s.reciprocalRank),
  );
  const top1 = average(
    positive
      .filter((s) => s.top1Correct !== null)
      .map((s) => (s.top1Correct ? 1 : 0)),
  );
  const negativeCorrectness = average(
    negative.map((s) => (s.falsePositive ? 0 : 1)),
  );

  // Weighted 0-1 score, later reported as a 0-100 number.
  const overall =
    0.25 * hitRate +
    0.2 * precision +
    0.2 * mrr +
    0.15 * top1 +
    0.2 * negativeCorrectness;

  return {
    hitRate,
    precision,
    mrr,
    top1,
    negativeCorrectness,
    overall,
  };
}

function printReport(scores: QueryScore[]) {
  console.log(
    "\n=== Retrieval quality scorecard: searchDocument ($text) ===\n",
  );

  console.log(
    "id".padEnd(26) +
      "category".padEnd(16) +
      "hit".padEnd(6) +
      "P@5".padEnd(8) +
      "RR".padEnd(6) +
      "top1",
  );
  for (const s of scores) {
    const hitCol =
      s.category === "negative"
        ? s.falsePositive
          ? "FP!"
          : "ok"
        : s.hit
          ? "yes"
          : "no";
    console.log(
      s.id.padEnd(26) +
        s.category.padEnd(16) +
        hitCol.padEnd(6) +
        pct(s.precisionAt5).padEnd(8) +
        s.reciprocalRank.toFixed(2).padEnd(6) +
        (s.top1Correct === null
          ? "-"
          : s.top1Correct
            ? "yes"
            : "no"),
    );
  }

  console.log("\n--- by category ---");
  const categories: Category[] = [
    "exact",
    "paraphrase",
    "conversational",
    "distractor",
    "negative",
  ];
  for (const cat of categories) {
    const subset = scores.filter((s) => s.category === cat);
    if (subset.length === 0) continue;

    if (cat === "negative") {
      const negCorrect = average(
        subset.map((s) => (s.falsePositive ? 0 : 1)),
      );
      console.log(
        `${cat.padEnd(16)} negativeQueryCorrectness=${pct(negCorrect)}  (n=${subset.length})`,
      );
      continue;
    }

    const hitRate = average(
      subset.map((s) => (s.hit ? 1 : 0)),
    );
    const precision = average(
      subset.map((s) => s.precisionAt5),
    );
    const mrr = average(
      subset.map((s) => s.reciprocalRank),
    );
    const top1 = average(
      subset
        .filter((s) => s.top1Correct !== null)
        .map((s) => (s.top1Correct ? 1 : 0)),
    );
    console.log(
      `${cat.padEnd(16)} hitRate=${pct(hitRate)}  precision=${pct(precision)}  mrr=${mrr.toFixed(2)}  top1=${pct(top1)}  (n=${subset.length})`,
    );
  }

  const overall = summarize(scores);
  console.log("\n--- overall ---");
  console.log(
    `Hit Rate@5:                  ${pct(overall.hitRate)}`,
  );
  console.log(
    `Precision@5:                 ${pct(overall.precision)}`,
  );
  console.log(
    `MRR:                         ${overall.mrr.toFixed(3)}`,
  );
  console.log(
    `Top-1 accuracy:              ${pct(overall.top1)}`,
  );
  console.log(
    `Negative-query correctness:  ${pct(overall.negativeCorrectness)}`,
  );
  console.log(
    `\nOVERALL RETRIEVAL SCORE:     ${(overall.overall * 100).toFixed(1)} / 100\n`,
  );

  return overall;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

describe("Retrieval quality evaluation (searchDocument / $text)", () => {
  const PDF_ID = new Types.ObjectId().toString();
  const USER_ID = "eval-user";
  const VAPI_SECRET = "eval-vapi-secret";

  let mongo: MongoMemoryServer;
  let scores: QueryScore[];
  let overall: ReturnType<typeof summarize>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();

    // database/mongoose.ts reads process.env.MONGODB_URI once, at
    // module-evaluation time - so the route handler must be imported
    // *after* this is set, which is why the import below is dynamic.
    process.env.MONGODB_URI = mongo.getUri();
    process.env.VAPI_SERVER_SECRET = VAPI_SECRET;
    process.env.VAPI_DOCUMENT_TOKEN_SECRET =
      "eval-doc-secret";

    await mongoose.connect(mongo.getUri());
    await PdfSegmentModel.createIndexes();

    await PdfSegmentModel.insertMany(
      SEGMENTS.map((s) => ({
        clerkId: USER_ID,
        pdfId: PDF_ID,
        content: s.content,
        segmentIndex: s.segmentIndex,
        pageNumber: s.pageNumber,
        wordCount: s.content.split(/\s+/).length,
      })),
    );

    const { POST } =
      await import("@/app/api/vapi/tool/route");

    const documentAccessToken = createVapiDocumentToken(
      PDF_ID,
      USER_ID,
    );
    const rawResults = new Map<string, string>();

    for (const q of QUERIES) {
      const request = new Request(
        "http://localhost/api/vapi/tool",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-vapi-secret": VAPI_SECRET,
          },
          body: JSON.stringify({
            message: {
              type: "tool-calls",
              toolCallList: [
                {
                  id: q.id,
                  function: {
                    name: "searchDocument",
                    // documentAccessToken is passed directly as a tool
                    // argument (checked first by getStringArg in route.ts)
                    // rather than via message.artifact.variableValues, so
                    // this test exercises the code path that's documented
                    // and guaranteed to work regardless of how your VAPI
                    // assistant's function schema is configured.
                    arguments: {
                      query: q.query,
                      documentAccessToken,
                    },
                  },
                },
              ],
            },
          }),
        },
      );

      const response = await POST(request);
      const body = await response.json();
      rawResults.set(q.id, body.results?.[0]?.result ?? "");
    }

    scores = QUERIES.map((q) => scoreQuery(q, rawResults));
    overall = printReport(scores);
  }, 180_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("the tool actually returns matches for at least some queries (harness sanity check)", () => {
    // If this fails, something is wrong with the harness itself (bad
    // token, wrong tool name, schema mismatch) rather than with retrieval
    // quality - fix that before trusting the scores below.
    const anyPositiveHit = scores.some(
      (s) =>
        s.category !== "negative" && s.returned.length > 0,
    );
    expect(anyPositiveHit).toBe(true);
  });

  it("finds the obvious, same-vocabulary answers (exact category)", () => {
    const exact = scores.filter(
      (s) => s.category === "exact",
    );
    const hitRate = average(
      exact.map((s) => (s.hit ? 1 : 0)),
    );
    // This is the easy case for a keyword index. If this is low, the
    // problem is more fundamental than "no semantic search" - check the
    // text index, query parsing, or auth/token wiring first.
    expect(hitRate).toBeGreaterThanOrEqual(0.6);
  });

  it("does not hallucinate an answer for a fully unrelated question", () => {
    const cleanNegative = scores.find(
      (s) => s.id === "negative-clean",
    );
    expect(cleanNegative?.falsePositive).toBe(false);
  });

  it("computes an overall score between 0 and 100", () => {
    expect(overall.overall * 100).toBeGreaterThanOrEqual(0);
    expect(overall.overall * 100).toBeLessThanOrEqual(100);
  });
});
