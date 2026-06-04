import { Button } from "@sbox-analytics/ui/components/button";
import { useRef } from "react";

interface ImageUploadControlProps {
  /** Whether a custom image is currently set (shows the remove button). */
  hasImage: boolean;
  pending: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export const ImageUploadControl = ({
  hasImage,
  pending,
  onUpload,
  onRemove,
}: ImageUploadControlProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <input
        accept="image/png,image/jpeg,image/webp"
        aria-label="Choose image file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUpload(file);
          }
          // Allow re-selecting the same file.
          e.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        {pending ? "Uploading…" : "Upload image"}
      </Button>
      {hasImage && (
        <Button
          disabled={pending}
          onClick={onRemove}
          size="sm"
          type="button"
          variant="ghost"
        >
          Remove
        </Button>
      )}
    </div>
  );
};
