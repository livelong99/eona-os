import { useMemo, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import type { ToolInput } from "@/lib/labs/toolsClient";
import { uploadFiles } from "@/lib/labs/toolsClient";
import { UploadDropzone } from "@/components/labs/UploadDropzone";

interface ToolRunFormProps {
  toolId: string;
  inputs: ToolInput[];
  busy?: boolean;
  onRun: (values: Record<string, unknown>) => void;
}

type Widget = "text" | "longtext" | "number" | "toggle" | "select" | "file" | "image";

// Normalizes the manifest's free-form input type into a widget kind.
function widgetFor(type: string): Widget {
  const t = type.toLowerCase().replace(/\[\]$/, "");
  if (t === "longtext" || t === "textarea" || t === "multiline") return "longtext";
  if (t === "number" || t === "int" || t === "integer" || t === "float") return "number";
  if (t === "toggle" || t === "bool" || t === "boolean" || t === "checkbox") return "toggle";
  if (t === "select" || t === "enum" || t === "choice") return "select";
  if (t === "image" || t === "img" || t === "photo" || t === "picture") return "image";
  if (t === "file" || t === "upload" || t === "document" || t === "doc") return "file";
  // url and other unknowns fall back to a text field (engine takes a string).
  return "text";
}

// A manifest type whose raw string ends in "[]" accepts multiple files.
const isMulti = (type: string) => /\[\]\s*$/.test(type);

// ToolRunForm — a dynamic launch form built from a tool's `inputs[]`. Respects
// each input's type, required flag, and select options. File/image inputs are
// uploaded immediately and submitted as arrays of engine-side paths.
export function ToolRunForm({ toolId, inputs, busy, onRun }: ToolRunFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const seed: Record<string, unknown> = {};
    for (const input of inputs) {
      seed[input.id] = widgetFor(input.type) === "toggle" ? false : "";
    }
    return seed;
  });

  // Per-input local file selections + upload state (kept out of `values`, which
  // holds the submitted paths once an upload resolves).
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const set = (id: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [id]: value }));

  // Replaces an input's selection and (re)uploads it, storing returned paths.
  const handleFiles = async (input: ToolInput, next: File[]) => {
    setFiles((prev) => ({ ...prev, [input.id]: next }));
    setErrors((prev) => ({ ...prev, [input.id]: null }));
    if (next.length === 0) {
      set(input.id, []);
      return;
    }
    setUploading((prev) => ({ ...prev, [input.id]: true }));
    try {
      const map = await uploadFiles(toolId, [{ inputId: input.id, files: next }]);
      set(input.id, map[input.id] ?? []);
    } catch (err) {
      set(input.id, []);
      setErrors((prev) => ({
        ...prev,
        [input.id]: err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      setUploading((prev) => ({ ...prev, [input.id]: false }));
    }
  };

  const anyUploading = useMemo(
    () => Object.values(uploading).some(Boolean),
    [uploading],
  );

  const missing = useMemo(
    () =>
      inputs.some((input) => {
        if (!input.required) return false;
        const widget = widgetFor(input.type);
        if (widget === "toggle") return false; // a toggle is always set
        if (widget === "file" || widget === "image") {
          const paths = values[input.id];
          return !Array.isArray(paths) || paths.length === 0;
        }
        const v = values[input.id];
        return v === undefined || v === null || String(v).trim() === "";
      }),
    [inputs, values],
  );

  const submit = () => {
    if (busy || missing || anyUploading) return;
    // Coerce numbers; drop empty optional fields so the engine sees a clean map.
    const payload: Record<string, unknown> = {};
    for (const input of inputs) {
      const widget = widgetFor(input.type);
      const raw = values[input.id];
      if (widget === "number") {
        if (raw === "" || raw === undefined) continue;
        const n = Number(raw);
        payload[input.id] = Number.isNaN(n) ? raw : n;
      } else if (widget === "toggle") {
        payload[input.id] = Boolean(raw);
      } else if (widget === "file" || widget === "image") {
        if (!Array.isArray(raw) || raw.length === 0) continue;
        payload[input.id] = raw;
      } else {
        if (raw === "" || raw === undefined) continue;
        payload[input.id] = raw;
      }
    }
    onRun(payload);
  };

  if (inputs.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-white/50">This tool takes no inputs.</p>
        <RunButton busy={busy} disabled={false} onClick={submit} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      {inputs.map((input) => {
        const widget = widgetFor(input.type);
        return (
          <div key={input.id}>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-white/70">
              {input.label || input.id}
              {input.required && <span className="text-[#f87171]">*</span>}
            </label>
            {input.hint && (
              <p className="mb-1.5 text-[11.5px] text-white/40">{input.hint}</p>
            )}

            {widget === "longtext" && (
              <textarea
                value={String(values[input.id] ?? "")}
                onChange={(e) => set(input.id, e.target.value)}
                rows={4}
                placeholder={input.placeholder}
                className="w-full resize-y rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.06]"
              />
            )}

            {widget === "text" && (
              <input
                type="text"
                value={String(values[input.id] ?? "")}
                onChange={(e) => set(input.id, e.target.value)}
                placeholder={input.placeholder}
                className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.06]"
              />
            )}

            {widget === "number" && (
              <input
                type="number"
                value={String(values[input.id] ?? "")}
                onChange={(e) => set(input.id, e.target.value)}
                placeholder={input.placeholder}
                className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.06]"
              />
            )}

            {widget === "select" && (
              <select
                value={String(values[input.id] ?? "")}
                onChange={(e) => set(input.id, e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none focus:border-white/25"
              >
                <option value="" className="bg-[#13141f] text-white/60">
                  Select…
                </option>
                {(input.options ?? []).map((opt) => (
                  <option key={opt} value={opt} className="bg-[#13141f] text-white">
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {widget === "toggle" && (
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(values[input.id])}
                onClick={() => set(input.id, !values[input.id])}
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 cursor-pointer ${
                  values[input.id] ? "bg-[#5227FF]" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                    values[input.id] ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            )}

            {(widget === "file" || widget === "image") && (
              <UploadDropzone
                variant={widget}
                multiple={isMulti(input.type)}
                files={files[input.id] ?? []}
                uploading={uploading[input.id]}
                error={errors[input.id]}
                onFiles={(next) => void handleFiles(input, next)}
              />
            )}
          </div>
        );
      })}

      <RunButton busy={busy} disabled={missing || anyUploading} onClick={submit} />
    </form>
  );
}

function RunButton({
  busy,
  disabled,
  onClick,
}: {
  busy?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition-colors duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer"
      style={{ background: "#5227FF" }}
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting run…
        </>
      ) : (
        <>
          <Play className="h-4 w-4" />
          Run tool
        </>
      )}
    </button>
  );
}
