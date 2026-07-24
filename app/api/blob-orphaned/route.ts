import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { urlOrPathname } = await request.json();

    if (
      typeof urlOrPathname !== "string" ||
      !urlOrPathname
    ) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 },
      );
    }

    const pathname = urlOrPathname.startsWith("http")
      ? new URL(urlOrPathname).pathname.replace(/^\//, "")
      : urlOrPathname;

    if (!pathname.startsWith(`users/${userId}/`)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    await del(urlOrPathname);
  } catch (innerErr) {
    console.error("Error deleting orphaned blob", innerErr);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete orphaned blobs",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
