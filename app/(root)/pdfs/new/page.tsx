import UploadForm from "@/components/UploadForm";
import React from "react";

const page = () => {
  return (
    <main className="new-book">
      <section className="flex flex-col gap-5 text-center">
        <h1 className="page-title-xl">Add a New PDF</h1>
        <p className="subtitle">
          Upload a PDF to generate your interactive reading
          experience
        </p>
      </section>

      <UploadForm />
    </main>
  );
};

export default page;
