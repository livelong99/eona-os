import { useCallback, useRef, useState } from "react";
import { Upload, Loader2, Film, Image as ImageIcon } from "lucide-react";
import {
  uploadBrandAssets,
  artifactRawUrl,
  type ArtifactFile,
} from "@/lib/labs/toolsClient";

interface AssetUploadZoneProps {
  toolId: string;
  runId: string;
  /** Asset artifacts already saved on the run (e.g. relpath "assets/<name>"). */
  assets: ArtifactFile[];
  /** Called after a successful upload so the parent can re-list artifacts. */
  onUploaded: () => void;
}

const ACCEPT = "image/*,video/*";

// AssetUploadZone — a drag/click dropzone that accepts images AND videos, POSTs
// them to the run's brand-assets endpoint, then shows uploaded assets as a
// thumbnail grid (images render, videos show a film chip). The parent owns the
// authoritative asset list and re-lists after each upload.
export function AssetUploadZone({ toolId, runId, assets, onUploaded }: AssetUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading) return;
      setUploading(true);
      setError(null);
      try {
        await uploadBrandAssets(toolId, runId, files);
        onUploaded();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [toolId, runId, uploading, onUploaded],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void upload(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
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
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files ?? []));
        }}
        className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-5 text-[13px] outline-none transition-colors focus-visible:border-white/25 focus-visible:bg-white/[0.06] ${
          dragging
            ? "border-[#5227FF]/60 bg-[#5227FF]/[0.06] text-white/80"
            : "border-white/12 bg-white/[0.04] text-white/55 hover:border-white/25 hover:bg-white/[0.06]"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/45" />
        ) : (
          <Upload className="h-4 w-4 shrink-0 text-white/45" />
        )}
        <span>{uploading ? "Uploading assets…" : "Drop images or videos, or click to choose"}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onInputChange}
        className="hidden"
      />

      {error && <p className="text-[11.5px] text-[#f87171]">{error}</p>}

      {assets.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {assets.map((asset) => (
            <AssetThumb key={asset.relpath} toolId={toolId} runId={runId} asset={asset} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetThumb({
  toolId,
  runId,
  asset,
}: {
  toolId: string;
  runId: string;
  asset: ArtifactFile;
}) {
  const url = artifactRawUrl(toolId, runId, asset.relpath);
  const isVideo = isVideoAsset(asset);

  return (
    <div className="group relative overflow-hidden rounded-md ring-1 ring-white/12">
      {asset.kind === "image" ? (
        <img src={url} alt={asset.name} loading="lazy" className="aspect-square w-full object-cover" />
      ) : isVideo ? (
        <video src={url} className="aspect-square w-full bg-black/40 object-cover" muted playsInline />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-white/[0.04]">
          <ImageIcon className="h-6 w-6 text-white/35" />
        </div>
      )}
      {isVideo && (
        <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/55 text-white/80">
          <Film className="h-3 w-3" />
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white/80">
        {asset.name}
      </div>
    </div>
  );
}

// A heuristic for video assets: the engine may report them as "other" with a
// video extension, so check the name too.
function isVideoAsset(asset: ArtifactFile): boolean {
  return /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(asset.name);
}
