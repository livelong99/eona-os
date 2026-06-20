import { useState } from "react";
import type { SettingGroup, Setting } from "@/lib/control";
import {
  Toggle,
  SelectField,
  Slider,
  SettingRow,
  Card,
  GroupTitle,
} from "@/components/control/primitives";

// SettingsPanel — renders schema-driven SettingGroups (toggle/select/slider/text)
// with local state. Used by the Hermes, Claude Code, and Obsidian sections.
export function SettingsPanel({ groups }: { groups: SettingGroup[] }) {
  const [values, setValues] = useState<Record<string, boolean | string | number>>(() => {
    const seed: Record<string, boolean | string | number> = {};
    groups.forEach((g) => g.settings.forEach((s) => (seed[s.id] = s.value)));
    return seed;
  });

  const set = (id: string, v: boolean | string | number) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <Card key={group.title}>
          <GroupTitle>{group.title}</GroupTitle>
          <div className="divide-y divide-white/[0.06]">
            {group.settings.map((s) => (
              <SettingRow
                key={s.id}
                label={s.label}
                desc={s.desc}
                control={renderControl(s, values[s.id], (v) => set(s.id, v))}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function renderControl(
  s: Setting,
  value: boolean | string | number,
  onChange: (v: boolean | string | number) => void,
) {
  switch (s.kind) {
    case "toggle":
      return <Toggle checked={value as boolean} onChange={onChange} label={s.label} />;
    case "select":
      return <SelectField value={value as string} options={s.options} onChange={onChange} label={s.label} />;
    case "slider":
      return (
        <Slider
          value={value as number}
          min={s.min}
          max={s.max}
          step={s.step}
          unit={s.unit}
          onChange={onChange}
          label={s.label}
        />
      );
    case "text":
      return (
        <input
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          aria-label={s.label}
          className={`w-64 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[13px] text-white outline-none transition-colors focus:border-white/30 ${s.mono ? "font-mono text-[12px]" : ""}`}
        />
      );
    default:
      return null;
  }
}
