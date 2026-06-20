import {
  Plus,
  Trash2,
  GripVertical,
  Target,
  ListChecks,
  FileInput,
  FileOutput,
  CircleCheck,
} from "lucide-react";
import {
  CATEGORIES,
  FIELD_TYPE_META,
  type FieldType,
  type IOField,
} from "@/lib/labs";
import { TOOL_ICONS } from "@/components/labs/toolIcon";
import {
  type BuilderState,
  makeField,
  makeStep,
} from "@/components/labs/builderState";
import {
  Field,
  TextInput,
  TextArea,
  StageHeading,
} from "@/components/labs/builderFields";

interface StageProps {
  state: BuilderState;
  set: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
}

const ICON_KEYS = Object.keys(TOOL_ICONS) as (keyof typeof TOOL_ICONS)[];

// Stage 0 — Identity
export function IdentityStage({ state, set }: StageProps) {
  return (
    <div className="space-y-5">
      <StageHeading title="Identity" blurb="What is this tool, in one line?" />
      <Field label="Tool name">
        <TextInput
          value={state.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Brand Maker"
        />
      </Field>
      <Field label="Tagline">
        <TextInput
          value={state.tagline}
          onChange={(e) => set("tagline", e.target.value)}
          placeholder="Generate a full brand identity from a one-line brief."
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("category", c)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
                  state.category === c
                    ? "border-[#5227FF]/50 bg-[#5227FF]/20 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/80"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Icon">
          <div className="flex flex-wrap gap-2">
            {ICON_KEYS.map((key) => {
              const Icon = TOOL_ICONS[key];
              const active = state.icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("icon", key)}
                  aria-label={`Icon ${key}`}
                  className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors duration-200 cursor-pointer ${
                    active
                      ? "border-[#5227FF]/50 bg-[#5227FF]/20 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </div>
  );
}

// Stage 1 — Skill & goals
export function SkillStage({ state, set }: StageProps) {
  const setGoal = (i: number, value: string) =>
    set("goals", state.goals.map((g, idx) => (idx === i ? value : g)));
  const addGoal = () => set("goals", [...state.goals, ""]);
  const removeGoal = (i: number) =>
    set("goals", state.goals.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <StageHeading title="Skill & goals" blurb="The capability it wields and the outcomes it drives." />
      <Field label="Skill" hint="the core capability the agent uses">
        <TextInput
          value={state.skill}
          onChange={(e) => set("skill", e.target.value)}
          placeholder="e.g. brand-identity-design"
        />
      </Field>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-white/55">
          <Target className="h-3.5 w-3.5" />
          Goals
        </div>
        <div className="space-y-2">
          {state.goals.map((goal, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.05] text-[11px] font-semibold text-white/50">
                {i + 1}
              </span>
              <TextInput
                value={goal}
                onChange={(e) => setGoal(i, e.target.value)}
                placeholder="A measurable outcome this tool produces"
              />
              {state.goals.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeGoal(i)}
                  aria-label="Remove goal"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/35 transition-colors hover:bg-white/10 hover:text-white/70 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <AddButton label="Add goal" onClick={addGoal} />
      </div>
    </div>
  );
}

// Stage 2 — Workflow
export function WorkflowStage({ state, set }: StageProps) {
  const update = (id: string, patch: Partial<{ title: string; detail: string }>) =>
    set("steps", state.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const add = () => set("steps", [...state.steps, makeStep()]);
  const remove = (id: string) =>
    set("steps", state.steps.filter((s) => s.id !== id));

  return (
    <div className="space-y-5">
      <StageHeading title="Workflow" blurb="The ordered steps the agent runs each time." />
      <div className="space-y-3">
        {state.steps.map((step, i) => (
          <div
            key={step.id}
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5"
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 shrink-0 text-white/25" />
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#5227FF]/25 text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <TextInput
                value={step.title}
                onChange={(e) => update(step.id, { title: e.target.value })}
                placeholder="Step title"
              />
              {state.steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(step.id)}
                  aria-label="Remove step"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/35 transition-colors hover:bg-white/10 hover:text-white/70 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 pl-8">
              <TextArea
                rows={2}
                value={step.detail}
                onChange={(e) => update(step.id, { detail: e.target.value })}
                placeholder="What happens in this step?"
              />
            </div>
          </div>
        ))}
      </div>
      <AddButton label="Add step" onClick={add} />
    </div>
  );
}

// Stage 3 — Inputs & outputs
export function IOStage({ state, set }: StageProps) {
  return (
    <div className="space-y-6">
      <StageHeading title="Inputs & outputs" blurb="The contract — what the tool takes in and gives back." />

      <FieldList
        title="Inputs"
        icon={<FileInput className="h-3.5 w-3.5" />}
        fields={state.inputs}
        onChange={(fields) => set("inputs", fields)}
      />
      <FieldList
        title="Outputs"
        icon={<FileOutput className="h-3.5 w-3.5" />}
        fields={state.outputs}
        onChange={(fields) => set("outputs", fields)}
      />

      <Field label="UI requirements" hint="how it should render">
        <TextArea
          rows={3}
          value={state.uiNotes}
          onChange={(e) => set("uiNotes", e.target.value)}
          placeholder="e.g. Show logo mockups in a 2-up gallery with a download action; collect the brief in a single hero textarea."
        />
      </Field>
    </div>
  );
}

function FieldList({
  title,
  icon,
  fields,
  onChange,
}: {
  title: string;
  icon: React.ReactNode;
  fields: IOField[];
  onChange: (fields: IOField[]) => void;
}) {
  const update = (id: string, patch: Partial<IOField>) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const add = () => onChange([...fields, makeField()]);
  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-white/55">
        {icon}
        {title}
      </div>
      <div className="space-y-2">
        {fields.map((f) => (
          <div key={f.id} className="flex items-center gap-2">
            <TextInput
              value={f.label}
              onChange={(e) => update(f.id, { label: e.target.value })}
              placeholder={`${title.slice(0, -1)} name`}
            />
            <select
              value={f.type}
              onChange={(e) => update(f.id, { type: e.target.value as FieldType })}
              aria-label="Field type"
              className="shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2.5 text-[13px] text-white/80 outline-none focus:border-white/25"
            >
              {(Object.keys(FIELD_TYPE_META) as FieldType[]).map((t) => (
                <option key={t} value={t} className="bg-[#13141f] text-white">
                  {FIELD_TYPE_META[t].label}
                </option>
              ))}
            </select>
            {fields.length > 1 && (
              <button
                type="button"
                onClick={() => remove(f.id)}
                aria-label="Remove field"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/35 transition-colors hover:bg-white/10 hover:text-white/70 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <AddButton label={`Add ${title.slice(0, -1).toLowerCase()}`} onClick={add} />
    </div>
  );
}

// Stage 4 — Review
export function ReviewStage({ state }: { state: BuilderState }) {
  const Icon = TOOL_ICONS[state.icon];
  return (
    <div className="space-y-5">
      <StageHeading title="Review" blurb="Confirm the spec, then publish to Labs." />

      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#5227FF]/20">
          <Icon className="h-6 w-6 text-[#a78bfa]" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white">
            {state.name || "Untitled tool"}
          </p>
          <p className="truncate text-[13px] text-white/50">
            {state.tagline || "No tagline yet"}
          </p>
        </div>
        <span className="ml-auto rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/60">
          {state.category}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<ListChecks className="h-4 w-4" />} label="Goals" value={state.goals.filter((g) => g.trim()).length} />
        <Stat icon={<CircleCheck className="h-4 w-4" />} label="Steps" value={state.steps.filter((s) => s.title.trim()).length} />
        <Stat icon={<FileInput className="h-4 w-4" />} label="I/O fields" value={
          state.inputs.filter((f) => f.label.trim()).length +
          state.outputs.filter((f) => f.label.trim()).length
        } />
      </div>

      <ReviewSection title="Skill" items={[state.skill || "—"]} />
      <ReviewSection title="Goals" items={state.goals.filter((g) => g.trim())} />
      <ReviewSection title="Workflow" items={state.steps.filter((s) => s.title.trim()).map((s) => s.title)} ordered />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
      <div className="flex items-center justify-center text-[#a78bfa]">{icon}</div>
      <p className="mt-1.5 text-[20px] font-semibold tabular-nums text-white">{value}</p>
      <p className="text-[11px] text-white/45">{label}</p>
    </div>
  );
}

function ReviewSection({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/35">{title}</p>
      <ul className="space-y-1">
        {items.length === 0 ? (
          <li className="text-[13px] text-white/35">Nothing yet</li>
        ) : (
          items.map((it, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-white/70">
              <span className="text-[#5227FF]">{ordered ? `${i + 1}.` : "•"}</span>
              {it}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-[12px] font-medium text-white/55 transition-colors hover:border-white/30 hover:text-white/80 cursor-pointer"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
