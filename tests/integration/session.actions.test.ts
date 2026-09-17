import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const USER_ID = "test-user";
const PDF_ID = new mongoose.Types.ObjectId().toString();

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({
    userId: USER_ID,
  }),
}));

describe("Voice session integration", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();

    process.env.MONGODB_URI = mongo.getUri();

    await mongoose.connect(mongo.getUri());
  });

  beforeEach(async () => {
    await mongoose.connection
      .collection("voicesessions")
      .deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it("starts a session, ends it, and sets endedAt and durationSeconds", async () => {
    const { startVoiceSession, endVoiceSession } =
      await import("@/lib/action/session.actions");

    const started = await startVoiceSession(PDF_ID);

    expect(started.success).toBe(true);

    if (!started.success) {
      throw new Error(started.error);
    }

    expect(started.sessionId).toBeDefined();

    // Give the session enough time to have a measurable duration.
    await new Promise((resolve) =>
      setTimeout(resolve, 1100),
    );

    const sessionId = started.sessionId;
    if (!sessionId) {
      throw new Error("Session ID was not returned");
    }

    const ended = await endVoiceSession(sessionId);

    expect(ended.success).toBe(true);

    const session = await mongoose.connection
      .collection("voicesessions")
      .findOne({
        _id: new mongoose.Types.ObjectId(sessionId),
      });

    expect(session).not.toBeNull();
    expect(session?.endedAt).toBeDefined();
    expect(session?.endedAt).toBeInstanceOf(Date);
    expect(session?.durationSeconds).toBeGreaterThan(0);
  });
});
