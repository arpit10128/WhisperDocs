import { createHmac, timingSafeEqual } from "node:crypto";

interface VapiDocumentToken {
  pdfId: string;
  userId: string;
  expiresAt: number;
}

function getSigningSecret(): string {
  const secret = process.env.VAPI_SERVER_SECRET;

  if (!secret) {
    throw new Error("VAPI_SERVER_SECRET is not configured");
  }

  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

export function createVapiDocumentToken(
  pdfId: string,
  userId: string,
): string {
  const payload: VapiDocumentToken = {
    pdfId,
    userId,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
  ).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyVapiDocumentToken(
  token: string | undefined,
): VapiDocumentToken | undefined {
  if (!token) return undefined;

  const [encodedPayload, encodedSignature] =
    token.split(".");
  if (!encodedPayload || !encodedSignature)
    return undefined;

  let expectedSignature: string;
  try {
    expectedSignature = sign(encodedPayload);
  } catch {
    return undefined;
  }
  const actual = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return undefined;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString(
        "utf8",
      ),
    ) as VapiDocumentToken;

    if (
      typeof payload.pdfId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}
