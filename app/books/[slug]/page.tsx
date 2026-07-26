import { getPdfBySlug } from "@/lib/action/pdf.actions";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VapiControls } from "@/components/VapiControls";

export default async function PdfDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { slug } = await params;
  const result = await getPdfBySlug(slug);

  if (!result.success || !result.data) {
    redirect("/");
  }

  const pdf = result.data;

  return (
    <div className="book-page-container">
      <Link href="/" className="back-btn-floating">
        <ArrowLeft className="size-6 text-[#212a3b]" />
      </Link>

      <VapiControls pdf={pdf} />
    </div>
  );
}
