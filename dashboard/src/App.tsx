import { lazy, Suspense } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import SideRays from "@/components/SideRays";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import {
  GlassDock,
  GlassFilter,
  type DockIcon,
} from "@/components/ui/liquid-glass";

// Route-level code splitting — each screen is its own chunk, so heavy deps
// (three.js for Home/Memory, react-markdown for Brainstorm) load only on demand.
const named = <T extends string>(p: Promise<Record<T, React.ComponentType>>, key: T) =>
  p.then((m) => ({ default: m[key] }));

const HomeScreen = lazy(() => named(import("@/screens/HomeScreen"), "HomeScreen"));
const CodeScreen = lazy(() => named(import("@/screens/CodeScreen"), "CodeScreen"));
const WorkspaceDetail = lazy(() => named(import("@/screens/WorkspaceDetail"), "WorkspaceDetail"));
const BrainstormScreen = lazy(() => named(import("@/screens/BrainstormScreen"), "BrainstormScreen"));
const BrainstormSession = lazy(() => named(import("@/screens/BrainstormSession"), "BrainstormSession"));
const LabsScreen = lazy(() => named(import("@/screens/LabsScreen"), "LabsScreen"));
// Typed lazy import (not via `named`) so the optional `toolId` prop survives —
// the dedicated /brand-maker and /flow-director routes pass it.
const LabsToolDetail = lazy(() =>
  import("@/screens/LabsToolDetail").then((m) => ({ default: m.LabsToolDetail })));
const BrandMakerRun = lazy(() => named(import("@/screens/BrandMakerRun"), "BrandMakerRun"));
const SwarmToolRun = lazy(() => named(import("@/components/toolkit/SwarmToolRun"), "SwarmToolRun"));
const FlowDirectorRun = lazy(() => named(import("@/screens/FlowDirectorRun"), "FlowDirectorRun"));
const MemoryScreen = lazy(() => named(import("@/screens/MemoryScreen"), "MemoryScreen"));
const ControlScreen = lazy(() => named(import("@/screens/ControlScreen"), "ControlScreen"));
const IntegrationsScreen = lazy(() => named(import("@/screens/IntegrationsScreen"), "IntegrationsScreen"));
const PlannerScreen = lazy(() => named(import("@/screens/PlannerScreen"), "PlannerScreen"));

// Top deck icons — custom Eona OS app icons (one per page). Each maps to a
// route. Light-theme set lives in public/icons/light as full-bleed square
// images (light background); the dock rounds the corners in CSS at render time.
const baseIcons: (Omit<DockIcon, "active" | "onClick"> & { route: string })[] = [
  { src: "/icons/light/home.jpeg", alt: "Home", route: "/" },
  { src: "/icons/light/workspace.jpeg", alt: "Workspace", route: "/workspace" },
  { src: "/icons/light/brainstorm.jpeg", alt: "Brainstorm", route: "/brainstorm" },
  { src: "/icons/light/labs.jpeg", alt: "Labs", route: "/labs" },
  { src: "/icons/light/brand-maker.jpeg", alt: "Brand Maker", route: "/brand-maker" },
  { src: "/icons/light/flow-director.jpeg", alt: "Flow Director", route: "/flow-director" },
  { src: "/icons/light/memory.jpeg", alt: "Memory", route: "/memory" },
  { src: "/icons/light/control.jpeg", alt: "Control", route: "/control" },
  { src: "/icons/light/integrations.jpeg", alt: "Integrations", route: "/integrations" },
  { src: "/icons/light/planner.jpeg", alt: "Planner", route: "/planner" },
];

// SideRays background speed. Home is the showcase; every other screen runs the
// background at 10% speed (−90%) so it stays a calm backdrop and frees frame
// budget for the page's own content.
const HOME_BG_SPEED = 2.5;
const QUIET_BG_SPEED = HOME_BG_SPEED * 0.1;

// Ray palette — tuned to the dark-glass identity (purple + blue).
const RAY_COLOR_1 = "#7C5CFF";
const RAY_COLOR_2 = "#4F8CFF";

// Eona OS — mockup shell. Persistent: SideRays background + top glass dock.
// Routes swap the active screen; the dock drives navigation.
function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  // The active dock icon: prefix-match non-home routes (so /workspace/:id keeps
  // Finder lit), otherwise fall back to the home (Claude) icon.
  const selected = (() => {
    const sub = baseIcons.findIndex(
      (i) => i.route !== "/" && location.pathname.startsWith(i.route),
    );
    if (sub >= 0) return sub;
    return Math.max(0, baseIcons.findIndex((i) => i.route === "/"));
  })();

  const dockIcons: DockIcon[] = baseIcons.map((icon, i) => ({
    src: icon.src,
    node: icon.node,
    alt: icon.alt,
    active: i === selected,
    onClick: () => navigate(icon.route),
  }));

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* SideRays background (React Bits, WebGL). Absolute fill behind content.
          Slows to 10% on non-home screens to keep it a quiet backdrop. */}
      <div className="absolute inset-0 z-0">
        <SideRays
          speed={isHome ? HOME_BG_SPEED : QUIET_BG_SPEED}
          rayColor1={RAY_COLOR_1}
          rayColor2={RAY_COLOR_2}
        />
      </div>

      {/* SVG distortion filter the glass dock references — mount once. */}
      <GlassFilter />

      {/* Top deck (liquid-glass dock) with macOS active dot — global nav.
          Compact (smaller) on non-home screens where it's just navigation. */}
      <div
        className={`fixed left-1/2 z-30 -translate-x-1/2 ${isHome ? "top-6" : "top-3"}`}
      >
        <GlassDock icons={dockIcons} compact={!isHome} />
      </div>

      <ErrorBoundary key={location.pathname}>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/workspace" element={<CodeScreen />} />
        <Route path="/workspace/:id" element={<WorkspaceDetail />} />
        <Route path="/brainstorm" element={<BrainstormScreen />} />
        <Route path="/brainstorm/:id" element={<BrainstormSession />} />
        <Route path="/labs" element={<LabsScreen />} />
        <Route path="/labs/:id" element={<LabsToolDetail />} />
        {/* Dedicated dock entries for the two creative tools. */}
        <Route path="/brand-maker" element={<LabsToolDetail toolId="brand-maker" />} />
        <Route path="/flow-director" element={<LabsToolDetail toolId="flow-director" />} />
        <Route path="/labs/run/:toolId/:projectId" element={<SwarmToolRun />} />
        <Route path="/labs/flow/:toolId/:projectId" element={<FlowDirectorRun />} />
        <Route path="/labs/:toolId/:brandId" element={<BrandMakerRun />} />
        <Route path="/memory" element={<MemoryScreen />} />
        <Route path="/control" element={<ControlScreen />} />
        <Route path="/integrations" element={<IntegrationsScreen />} />
        <Route path="/planner" element={<PlannerScreen />} />
        {/* Unknown routes fall back to Home. */}
        <Route path="*" element={<HomeScreen />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </main>
  );
}

export default App;
