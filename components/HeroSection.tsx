import React from "react";
import Link from "next/link";
import Image from "next/image";

const HeroSection = () => {
  return (
    <section className="wrapper mb-10 md:mb-16">
      <div className="library-hero-card">
        <div className="library-hero-content">
          {/* Left part */}
          <div className="library-hero-text">
            <h1 className="library-hero-title text-4xl font-serif font-bold">
              WhisperDocs
            </h1>
            <p className="library-hero-description">
              Your PDFs are now conversations.
              Conversationalize any document instantly. Read
              with your voice, listen to answers, and learn
              interactively.
            </p>
            <Link
              href={"/pdfs/new"}
              className="library-cta-primary mt-4 flex items-center justify-center"
            >
              <span className="text-3xl font-light mb-1 mr-2 text-[#ffffff]">
                +
              </span>
              <span className="text-[#ffffff]">
                Add New Pdf
              </span>
            </Link>
          </div>

          {/* Center part - Desktop */}
          <div className="library-hero-illustration-desktop">
            <Image
              src={"/assets/heroSectionTrans.png"}
              alt="Girl Reading"
              width={400}
              height={400}
              className="object-contain"
            />
          </div>

          {/* Center part - Mobile (Hidden on desktop) */}

          <div className="library-hero-illustration">
            <Image
              src={"/assets/heroSectionTrans.png"}
              alt="Girl Reading"
              width={300}
              height={300}
              className="object-contain"
            />
          </div>

          {/* Right part */}
          <div className="library-steps-card min-w-[280px] max-w-[350px] z-10 shadow-soft-md">
            <ul className="space-y-6">
              <li className="library-step-item">
                <div className="flex w-full justify-between items-center">
                  <div className="w-10 h-10 min-w-10 min-h-10 rounded-full border border-gray-300 flex items-center justify-center font-medium text-lg bg-(--color-brand) text-white">
                    1
                  </div>

                  <div className="flex flex-col">
                    <h3 className="library-step-title text-lg font-bold">
                      Drop PDF Here
                    </h3>
                    <p className="library-step-description text-gray-500">
                      Or click to select your PDF
                    </p>
                  </div>

                  <div>
                    <Image
                      src={"/assets/pdf.png"}
                      alt="pdf"
                      width={70}
                      height={70}
                      className="object-contain"
                    />
                  </div>
                </div>
              </li>
              <li className="library-step-item">
                <div className="w-10 h-10 min-w-10 min-h-10 rounded-full border border-gray-300 flex items-center justify-center font-medium text-lg bg-(--color-brand) text-white">
                  2
                </div>

                <div className="flex flex-col">
                  <h3 className="library-step-title text-lg font-bold">
                    Conversationalize PDF
                  </h3>
                  <p className="library-step-description text-gray-500">
                    Our AI constructs your interactive chat
                    experience
                  </p>
                </div>

                <div>
                  <Image
                    src={"/assets/convTrans.png"}
                    alt="pdf"
                    width={110}
                    height={110}
                    className="object-contain"
                  />
                </div>
              </li>
              <li className="library-step-item">
                <div className="w-10 h-10 min-w-10 min-h-10 rounded-full border border-gray-300 flex items-center justify-center font-medium text-lg bg-(--color-brand) text-white">
                  3
                </div>

                <div className="flex flex-col">
                  <h3 className="library-step-title text-lg font-bold">
                    Start Voice Chat
                  </h3>
                  <p className="library-step-description text-gray-500">
                    Ask questions and hear responses by
                    voice
                  </p>
                </div>
                <div>
                  <Image
                    src={"/assets/headphoneTrans.png"}
                    alt="pdf"
                    width={70}
                    height={70}
                    className="object-contain"
                  />
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
