// Local form state + reducer for the tool builder. Kept separate from the UI so
// the wizard component stays focused on layout.
import {
  type ToolCategory,
  type ToolIconKey,
  type WorkflowStep,
  type IOField,
  type FieldType,
} from "@/lib/labs";

export interface BuilderState {
  name: string;
  tagline: string;
  category: ToolCategory;
  icon: ToolIconKey;
  skill: string;
  goals: string[];
  steps: WorkflowStep[];
  inputs: IOField[];
  outputs: IOField[];
  uiNotes: string;
}

export const EMPTY_BUILDER: BuilderState = {
  name: "",
  tagline: "",
  category: "Creative",
  icon: "wand",
  skill: "",
  goals: [""],
  steps: [{ id: rid(), title: "", detail: "" }],
  inputs: [{ id: rid(), label: "", type: "text" }],
  outputs: [{ id: rid(), label: "", type: "text" }],
  uiNotes: "",
};

export function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function makeField(type: FieldType = "text"): IOField {
  return { id: rid(), label: "", type };
}

export function makeStep(): WorkflowStep {
  return { id: rid(), title: "", detail: "" };
}

// Validation per stage — drives the "next" button + step completion ticks.
export function stageComplete(stage: number, s: BuilderState): boolean {
  switch (stage) {
    case 0:
      return s.name.trim().length > 0 && s.tagline.trim().length > 0;
    case 1:
      return s.skill.trim().length > 0 && s.goals.some((g) => g.trim().length > 0);
    case 2:
      return s.steps.some((st) => st.title.trim().length > 0);
    case 3:
      return (
        s.inputs.some((f) => f.label.trim().length > 0) &&
        s.outputs.some((f) => f.label.trim().length > 0)
      );
    case 4:
      return true;
    case 5:
      return true;
    default:
      return false;
  }
}
