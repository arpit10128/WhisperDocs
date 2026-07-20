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

    if (!urlOrPathname) {
      return NextResponse.json(
        { error: "Missing blob identifier" },
        { status: 400 },
      );
    }

    await del(urlOrPathname);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Blob delete error", error);
    return NextResponse.json(
      { error: "Failed to delete blob" },
      { status: 500 },
    );
  }
}
