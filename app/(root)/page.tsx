import HeroSection from "@/components/HeroSection";
import BookCard from "@/components/BookCard";
import { getAllPdf } from "@/lib/action/pdf.actions";

const page = async () => {
  const pdfResults = await getAllPdf();
  const pdfs = pdfResults.success && Array.isArray(pdfResults.data) ? pdfResults.data : [];
  return (
    <main className="wrapper container">
      <div>
        <HeroSection />
      </div>

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
    </main>
  );
};

export default page;
