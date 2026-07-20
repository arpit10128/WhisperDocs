import HeroSection from "@/components/HeroSection";
import BookCard from "@/components/BookCard";
import { getAllPdf } from "@/lib/action/pdf.actions";

const page = async () => {
  const pdfResults = await getAllPdf();
  const pdfs =
    pdfResults.success && Array.isArray(pdfResults.data)
      ? pdfResults.data
      : [];
  const hasLoadError = !pdfResults.success;

  return (
    <main className="wrapper container">
      <div>
        <HeroSection />
      </div>

      {hasLoadError ? (
        <div className="library-empty-card mt-8 text-center">
          <p className="text-base font-semibold text-[#1C1E21]">
            We couldn’t load your library right now.
          </p>
          <p className="mt-2 text-sm text-[#65676B]">
            Please refresh the page or try again shortly.
          </p>
        </div>
      ) : pdfs.length === 0 ? (
        <div className="library-empty-card mt-8 text-center">
          <p className="text-base font-semibold text-[#1C1E21]">
            Your library is empty.
          </p>
          <p className="mt-2 text-sm text-[#65676B]">
            Upload a PDF to get started.
          </p>
        </div>
      ) : (
        <div className="library-books-grid">
          {pdfs.map((pdf) => (
            <BookCard
              key={pdf._id}
              title={pdf.title}
              author={pdf.author}
              coverURL={pdf.coverURL}
              slug={pdf.slug}
            />
          ))}
        </div>
      )}
    </main>
  );
};

export default page;
