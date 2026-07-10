"use client";

import { uploadSchema } from "@/lib/zod";
import { BookUploadFormValues } from "@/types";
import { useAuth } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
// import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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

const UploadForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { userId } = useAuth();
  //   const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  const onSumbit = async (data: BookUploadFormValues) => {
    if (!userId)
      return toast.error("Please login to upload PDFs");
    console.log(data);
    //simulate submission
    await new Promise((resolve) =>
      setTimeout(resolve, 3000),
    );
    setIsSubmitting(true);
  };

  if (!isMounted) return null;

  return (
    <div>
      {/* In JavaScript, && doesn't always return true or false. It returns:
        the first falsy value, or
        the last value if everything is truthy. */}
      {isSubmitting && <LoadingOverlay />}

      <div className="new-book-wrapper">
        <Field>
          <form
            onSubmit={form.handleSubmit(onSumbit)}
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
              label="cover Image (Optional)"
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
