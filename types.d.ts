import z from "zod";
import { uploadSchema } from "./lib/zod";
import {
  Control,
  FieldPath,
  FieldValues,
} from "react-hook-form";
import { LucideIcon } from "lucide-react";

interface BookCardProps {
  title: string;
  author: string;
  coverURL: string;
  slug: string;
}

export type BookUploadFormValues = z.infer<
  typeof uploadSchema
>;

export interface VoiceSelectorProps {
  disabled?: boolean;
  className?: string;
  value?: string;
  onChange: (voiceId: string) => void;
}

export interface FileUploadFieldProps<
  T extends FieldValues,
> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  acceptTypes: string[];
  disabled?: boolean;
  icon: LucideIcon;
  placeholder: string;
  hint: string;
}
