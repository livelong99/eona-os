import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, ImageIcon, FileText, X, Loader2 } from "lucide-react";

export type DropzoneVariant = "file" | "image";

interface UploadDropzoneProps {
  /** "image" shows a thumbnail grid; "file" shows a compact chip list. */
  variant: DropzoneVariant;
  /** Allow more than one file (mirrors the manifest's `[]` suffix). */
  multiple: boolean;
  /** The currently selected local files (source of truth lives in the parent). */
  files: File[];
  /** Whether an upload for this input is in flight. */
  uploading?: boolean;
  /** Inline error text shown beneath the zone, when present. */
  error?: string | null;
  /** Called with the next file selection (already merged/replaced for arity). */
  onFiles: (files: File[]) => void;
}

const IMAGE_ACCEPT = "image/*";
const FILE_ACCEPT = ".pdf,.md,.txt,.doc,.docx,.rtf,.csv,.json";

// UploadDropzone — a click-or-drag file picker styled to the dark-glass system.
// Renders image thumbnails or document chips depending on `variant`. The parent
// owns the File[] and the upload lifecycle; this component is presentational
// plus selection handling.
export function UploadDropzone({
  variant,
  multiple,
  files,
  uploading,
  error,
  onFiles,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const accept = variant === "image" ? IMAGE_ACCEPT : FILE_ACCEPT;

  // Merge for multi-input, replace for single-input.
  const acceptPicked = useCallback(
    (picked: File[]) => {
      if (picked.length === 0) return;
      onFiles(multiple ? [...files, ...picked] : [picked[0]]);
    },
    [files, multiple, onFiles],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptPicked(Array.from(e.target.files ?? []));
    // Reset so re-picking the same file still fires onChange.
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    acceptPicked(Array.from(e.dataTransfer.files ?? []));
  };

  const removeAt = (idx: number) =>
    onFiles(files.filter((_, i) => i !== idx));

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-[13px] outline-none transition-colors focus-visible:border-white/25 focus-visible:bg-white/[0.06] ${
          dragging
            ? "border-[#5227FF]/60 bg-[#5227FF]/[0.06] text-white/80"
            : "border-white/12 bg-white/[0.04] text-white/55 hover:border-white/25 hover:bg-white/[0.06]"
        }`}
      >
        {variant === "image" ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-white/45" />
        ) : (
          <Upload className="h-4 w-4 shrink-0 text-white/45" />
        )}
        <span>
          {multiple ? "Drop files or click to choose" : "Drop a file or click to choose"}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onInputChange}
        className="hidden"
      />

      {variant === "image"
        ? files.length > 0 && (
            <ThumbnailGrid files={files} onRemove={removeAt} />
          )
        : files.length > 0 && <ChipList files={files} onRemove={removeAt} />}

      {uploading && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-white/50">
          <Loader2 className="h-3 w-3 animate-spin" />
          Uploading…
        </p>
      )}

      {error && <p className="mt-2 text-[11.5px] text-[#f87171]">{error}</p>}
    </div>
  );
}

// Image previews use object URLs, revoked when the file set changes / unmounts.
function ThumbnailGrid({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (idx: number) => void;
}) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {files.map((file, i) => (
        <div
          key={`${file.name}-${i}`}
          className="group relative overflow-hidden rounded-md ring-1 ring-white/12"
        >
          {urls[i] && (
            <img
              src={urls[i]}
              alt={file.name}
              className="aspect-square w-full object-cover"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white/80">
            {file.name}
          </div>
          <RemoveButton onClick={() => onRemove(i)} label={`Remove ${file.name}`} />
        </div>
      ))}
    </div>
  );
}

function ChipList({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (idx: number) => void;
}) {
  return (
    <ul className="mt-2 space-y-1.5">
      {files.map((file, i) => (
        <li
          key={`${file.name}-${i}`}
          className="flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-2 text-[12.5px] text-white/75"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-white/45" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-[11px] text-white/40">{formatSize(file.size)}</span>
          <RemoveButton onClick={() => onRemove(i)} label={`Remove ${file.name}`} compact />
        </li>
      ))}
    </ul>
  );
}

function RemoveButton({
  onClick,
  label,
  compact,
}: {
  onClick: () => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={
        compact
          ? "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-white/45 outline-none transition-colors hover:bg-white/10 hover:text-white/80 focus-visible:ring-1 focus-visible:ring-white/25"
          : "absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-black/55 text-white/70 outline-none transition-colors hover:bg-black/75 hover:text-white focus-visible:ring-1 focus-visible:ring-white/25"
      }
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
