import { useEffect, useState } from "react";
import { getProjectArtifacts, type ArtifactFile } from "@/lib/labs/toolsClient";

type ProjectArtifactsState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; files: ArtifactFile[] };

// useProjectArtifacts — loads an existing project's (brand's) artifacts off disk,
// independent of any live run. Used to open a project in read-only PROJECT mode
// when no live run is found. Skips (stays "loading"→noop) when not enabled.
export function useProjectArtifacts(
  enabled: boolean,
  toolId: string | undefined,
  brandId: string | undefined,
): ProjectArtifactsState {
  const [state, setState] = useState<ProjectArtifactsState>({ phase: "loading" });

  useEffect(() => {
    if (!enabled || !toolId || !brandId) return;
    const controller = new AbortController();
    setState({ phase: "loading" });
    getProjectArtifacts(toolId, brandId, controller.signal)
      .then((files) => {
        if (controller.signal.aborted) return;
        setState({ phase: "ready", files });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Could not load this project.",
        });
      });
    return () => controller.abort();
  }, [enabled, toolId, brandId]);

  return state;
}
