import React, { useCallback, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FieldValues,
  useController,
} from "react-hook-form";
import { FileUploadFieldProps } from "@/types";

const FileUploader = <T extends FieldValues>({
  control,
  name,
  label,
  acceptTypes,
  disabled,
  icon: Icon,
  placeholder,
  hint,
}: FileUploadFieldProps<T>) => {
  const {
    field: { onChange, value },
    fieldState: { error },
  } = useController({ name, control });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onChange(file);
      }
    },
    [onChange],
  );

  const onRemove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onChange(undefined as unknown as File);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [onChange],
  );

  const isUploaded = !!value;

  return (
    //Todo: Make the upload trigger keyboard accessible.
    <div className="w-full">
      <label className="form-label mb-2 block text-sm font-medium text-slate-900">
        {label}
      </label>
      <div
        className={cn(
          "upload-dropzone cursor-pointer rounded-xl border-2 border-dashed border-[#000000]/20 bg-white px-4 py-8 text-center transition hover:border-[#000000]",
          isUploaded &&
            "upload-dropzone-uploaded border-solid border-[#000000]/40",
          disabled && "pointer-events-none opacity-70",
        )}
        onClick={() =>
          !disabled && inputRef.current?.click()
        }
      >
        <input
          type="file"
          accept={acceptTypes.join(",")}
          className="hidden"
          ref={inputRef}
          onChange={handleFileChange}
          disabled={disabled}
        />

        {isUploaded ? (
          <div className="flex flex-col items-center justify-center gap-2">
            <p className="upload-dropzone-text line-clamp-1 text-sm font-medium text-slate-900">
              {(value as File).name}
            </p>
            <button
              type="button"
              onClick={onRemove}
              className="upload-dropzone-remove inline-flex items-center justify-center rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200"
            >
              <X className="h-8 w-8" />
            </button>
          </div>
        ) : (
          <>
            <Icon className="mx-auto mb-3 h-8 w-8 text-[#1877F2]" />
            <p className="upload-dropzone-text text-sm font-medium text-slate-900">
              {placeholder}
            </p>
            <p className="upload-dropzone-hint mt-2 text-xs text-slate-500">
              {hint}
            </p>
          </>
        )}
      </div>
      {error?.message && (
        <p className="mt-2 text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
};

export default FileUploader;
