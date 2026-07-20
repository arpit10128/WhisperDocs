"use client";

import { uploadSchema } from "@/lib/zod";
import { BookUploadFormValues } from "@/types";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
// import { useRouter } from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import LoadingOverlay from "./LoadingOverlay";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldContent,
} from "./ui/field";
import FileUploader from "./FileUploader";
import {
  ACCEPTED_PDF_TYPES,
  ACCEPTED_IMAGE_TYPES,
} from "@/lib/constants";
import { ImageIcon, Upload } from "lucide-react";
import { Input } from "./ui/input";
import { Controller } from "react-hook-form";
import VoiceSelector from "./VoiceSelector";
import { Button } from "./ui/button";
import {
  checkPdfExists,
  createPdf,
  savePdfSegments,
} from "@/lib/action/pdf.actions";
import { useRouter } from "next/navigation";
import { parsePDFFile } from "@/lib/utils";
import { upload } from "@vercel/blob/client";

const UploadForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { userId } = useAuth();
  const router = useRouter();

  //useForm<Input, Context, Output>()
  const form = useForm<BookUploadFormValues>({
    //This connects Zod validation schema with React Hook Form.
    //Without a resolver, React Hook Form only collects values.
    //With a resolver, it also validates them using Zod.
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      author: "",
      persona: "",
      pdfFile: undefined,
      coverImage: undefined,
    },
  });

  const onSubmit = async (data: BookUploadFormValues) => {
    if (!userId)
      return toast.error("Please login to upload PDFs");

    setIsSubmitting(true);

    try {
      const existscheck = await checkPdfExists(data.title);

      if (existscheck.success && existscheck.data) {
        toast.info(
          "PDF with the same title already exists.",
        );
        form.reset();
        router.push(`pdfs/${existscheck.data.slug}`);
        return;
      }

      const fileTitle = data.title
        .replace(/\s+/g, "-")
        .toLowerCase();

      const pdfFile = data.pdfFile;

      const parsePDF = await parsePDFFile(pdfFile);

      if (parsePDF.content.length === 0) {
        toast.error(
          "Failed to parse PDF. Please try again with a different file.",
        );
        return;
      }

      const uploadedPdfBlob = await upload(
        fileTitle,
        pdfFile,
        {
          access: "public",
          handleUploadUrl: "/api/upload",
          contentType: "application/pdf",
        },
      );

      let coverUrl: string;

      if (data.coverImage) {
        const coverFile = data.coverImage;
        const uploadedCoverBlob = await upload(
          `${fileTitle}_cover.png`,
          coverFile,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: coverFile.type,
          },
        );
        coverUrl = uploadedCoverBlob.url;
      } else {
        const response = await fetch(parsePDF.cover);

        const blob = await response.blob();

        const uploadedCoverBlob = await upload(
          `${fileTitle}_cover.png`,
          blob,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: "image/png",
          },
        );
        coverUrl = uploadedCoverBlob.url;
      }

      const pdf = await createPdf({
        clerkId: userId,
        title: data.title,
        author: data.author,
        persona: data.persona,
        fileURL: uploadedPdfBlob.url,
        fileBlobKey: uploadedPdfBlob.pathname,
        coverURL: coverUrl,
        fileSize: pdfFile.size,
      });

      if (!pdf.success)
        throw new Error("Failed to create PDF.");

      const segments = await savePdfSegments(
        pdf.data._id,
        userId,
        parsePDF.content,
      );

      if (!segments) {
        toast.error("Failed to save pdf segments");
        throw new Error("Failed to save pdf segments");
      }

      form.reset();
      router.push("/");
    } catch (e) {
      console.error(e);
      toast.error(
        "Failed to upload Pdf. Please try again later",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* In JavaScript, && doesn't always return true or false. It returns:
        the first falsy value, or
        the last value if everything is truthy. */}
      {isSubmitting && <LoadingOverlay />}

      <div className="new-book-wrapper">
        <Field>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
          >
            {/* 1. PDF File Upload */}
            <FileUploader
              control={form.control}
              name="pdfFile"
              label="PDF File"
              acceptTypes={ACCEPTED_PDF_TYPES}
              icon={Upload}
              placeholder="Click to upload PDF"
              hint="PDF File (max 50MB)"
              disabled={isSubmitting}
            />

            {/* 2. Cover Image Upload */}
            <FileUploader
              control={form.control}
              name="coverImage"
              label="Cover Image (Optional)"
              acceptTypes={ACCEPTED_IMAGE_TYPES}
              icon={ImageIcon}
              placeholder="Click to upload cover image"
              hint="Leave empty to auto-generate from PDF"
              disabled={isSubmitting}
            />

            {/* 3. Title Input */}
            <Field>
              <FieldLabel className="form-label">
                Title
              </FieldLabel>
              <FieldContent>
                <Controller
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <Input
                      {...field}
                      className="form-input"
                      id="title"
                      placeholder="ex: Clean Code"
                      disabled={isSubmitting}
                    />
                  )}
                />
                <FieldError
                  errors={
                    form.formState.errors.title && [
                      {
                        message:
                          form.formState.errors.title
                            .message,
                      },
                    ]
                  }
                />
              </FieldContent>
            </Field>

            {/* 4. Author Input */}
            <Field>
              <FieldLabel className="form-label">
                Author Name
              </FieldLabel>
              <FieldContent>
                <Controller
                  control={form.control}
                  name="author"
                  render={({ field }) => (
                    <Input
                      {...field}
                      className="form-input"
                      id="author"
                      placeholder="ex: Robert C Martin"
                      disabled={isSubmitting}
                    />
                  )}
                />
                <FieldError
                  errors={
                    form.formState.errors.author && [
                      {
                        message:
                          form.formState.errors.author
                            .message,
                      },
                    ]
                  }
                />
              </FieldContent>
            </Field>

            {/* 5. Voice Selector */}
            <Field>
              <FieldLabel className="form-label">
                Choose Assistant Voice
              </FieldLabel>
              <FieldContent>
                <Controller
                  control={form.control}
                  name="persona"
                  render={({ field }) => (
                    <VoiceSelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
                <FieldError
                  errors={
                    form.formState.errors.persona && [
                      {
                        message:
                          form.formState.errors.persona
                            .message,
                      },
                    ]
                  }
                />
              </FieldContent>
            </Field>

            {/* 6. Submit Button */}
            <Button
              type="submit"
              className="form-btn"
              disabled={isSubmitting}
            >
              Begin Synthesis
            </Button>
          </form>
        </Field>
      </div>
    </div>
  );
};

export default UploadForm;
