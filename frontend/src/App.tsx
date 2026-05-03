import { useEffect, useRef, useState } from "react";
import Graph from "./Graph";
import NodeInspector from "./NodeInspector";
import SummaryPanel from "./SummaryPanel";
import { WorkflowGraph, WorkflowNode, WorkflowEdge, WorkflowRun, WorkflowTemplate, RunSummary, RunSource, SummaryPane, Status } from "./types";
import { getInitialDemoGraph, runDemoSimulation } from "./demoWorkflow";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const VIEWER_MODE = import.meta.env.VITE_VIEWER_MODE === "true";

const SEED_TEMPLATES: WorkflowTemplate[] = [
  { id: "rnaseq-demo", name: "RNA-seq demo", source: "local", description: "Demo RNA-seq pipeline with simulated execution" },
];

const RUN_STATUS_COLOUR: Record<WorkflowRun["status"], string> = {
  PENDING:   "#9ca3af",
  RUNNING:   "#f59e0b",
  COMPLETED: "#22c55e",
  FAILED:    "#ef4444",
};

const RUN_SOURCE_CONFIG: Record<RunSource, { label: string; color: string }> = {
  "sample":         { label: "SAMPLE", color: "#60a5fa" },
  "simulated":      { label: "DEMO",   color: "#fbbf24" },
  "upload":         { label: "UPLOAD", color: "#a78bfa" },
  "local-nextflow": { label: "LOCAL",  color: "#4ade80" },
};

function PulsingBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      background: "rgba(15,17,23,0.88)",
      border: "1px solid #2d3148",
      borderRadius: 20,
      padding: "5px 14px",
      fontSize: 12,
      color: "#94a3b8",
    }}>
      <svg width="8" height="8" style={{ flexShrink: 0 }}>
        <circle cx="4" cy="4" r="4" fill="#f59e0b">
          <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
      </svg>
      {message}
    </div>
  );
}

// ── Dropdown helpers ──────────────────────────────────────────────────────────

function DropdownMenu({ label, triggerStyle, open, onToggle, disabled, title, children }: {
  label: React.ReactNode;
  triggerStyle?: React.CSSProperties;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  // onToggle changes identity each render but is semantically stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const base: React.CSSProperties = {
    padding: "6px 11px", borderRadius: 6, fontSize: 13, fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5,
    border: "1px solid #3d4468", background: "#2d3148", color: "#e2e8f0",
    opacity: disabled ? 0.5 : 1,
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={onToggle} style={{ ...base, ...triggerStyle }} disabled={disabled} title={title}>
        {label}
        <span style={{ fontSize: 8, opacity: 0.55, marginTop: 1 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "#161b2e", border: "1px solid #2d3148", borderRadius: 6,
          padding: 4, minWidth: 170, zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, disabled, children }: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "7px 10px", borderRadius: 4, border: "none",
        background: hover && !disabled ? "#2d3148" : "transparent",
        color: disabled ? "#475569" : "#e2e8f0",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12, fontWeight: 500, opacity: disabled ? 0.55 : 1,
        lineHeight: 1.4,
      }}
    >
      {children}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: "#2d3148", margin: "3px 4px" }} />;
}

// ── Process graph derivation ──────────────────────────────────────────────────
const PROC_RANK: Record<string, number> = {
  UNKNOWN: 0, SKIPPED: 0, CACHED: 1, COMPLETED: 1, RUNNING: 2, FAILED: 3,
};
const RANK_TO_STATUS = ["UNKNOWN", "COMPLETED", "RUNNING", "FAILED"] as const;

function processKeyOf(label: string): string {
  if (/fromFilePairs/i.test(label)) return "Input";
  const segs = label.split(":");
  return segs[segs.length - 1].trim() || label;
}

function deriveProcessGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const groups = new Map<string, WorkflowNode[]>();
  for (const n of nodes) {
    const key = processKeyOf(n.label);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  const procNodes: WorkflowNode[] = [];
  const keyToId = new Map<string, string>();
  let i = 0;
  for (const [key, children] of groups) {
    const id = `proc-${i++}`;
    keyToId.set(key, id);

    let worstRank = 0;
    let completed = 0, failed = 0, running = 0, unknown = 0;
    for (const c of children) {
      const rank = PROC_RANK[c.status ?? "UNKNOWN"] ?? 0;
      if (rank > worstRank) worstRank = rank;
      const s = c.status;
      if (s === "COMPLETED" || s === "CACHED") completed++;
      else if (s === "FAILED") failed++;
      else if (s === "RUNNING") running++;
      else unknown++;
    }

    procNodes.push({
      id,
      label: key,
      status: RANK_TO_STATUS[worstRank] as Status,
      taskCount: children.length,
      completedCount: completed,
      failedCount: failed,
      runningCount: running,
      unknownCount: unknown,
      childNodeIds: children.map((c) => c.id),
    });
  }

  const nodeToKey = new Map(nodes.map((n) => [n.id, processKeyOf(n.label)]));
  const seen = new Set<string>();
  const procEdges: WorkflowEdge[] = [];
  for (const e of edges) {
    const sk = nodeToKey.get(e.source);
    const tk = nodeToKey.get(e.target);
    if (!sk || !tk || sk === tk) continue;
    const sid = keyToId.get(sk)!;
    const tid = keyToId.get(tk)!;
    const ekey = `${sid}→${tid}`;
    if (!seen.has(ekey)) { seen.add(ekey); procEdges.push({ source: sid, target: tid }); }
  }

  return { nodes: procNodes, edges: procEdges };
}
// ── End process graph derivation ─────────────────────────────────────────────

function findRootCauseCandidate(
  selected: WorkflowNode,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNode | null {
  if (selected.status !== "FAILED") return null;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!parentMap.has(e.target)) parentMap.set(e.target, []);
    parentMap.get(e.target)!.push(e.source);
  }

  // BFS backward from selected — collect all FAILED ancestors
  const visited = new Set<string>([selected.id]);
  const queue = [selected.id];
  const failedAncestorIds = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const pid of (parentMap.get(id) ?? [])) {
      if (visited.has(pid)) continue;
      visited.add(pid);
      const pn = nodeById.get(pid);
      if (pn?.status === "FAILED") {
        failedAncestorIds.add(pid);
        queue.push(pid);
      }
    }
  }

  if (failedAncestorIds.size === 0) return null; // selected is the root cause

  // Find the earliest FAILED ancestor — one whose own parents are not FAILED
  for (const id of failedAncestorIds) {
    const hasFailedParent = (parentMap.get(id) ?? []).some((pid) => failedAncestorIds.has(pid));
    if (!hasFailedParent) return nodeById.get(id)!;
  }

  return nodeById.get(failedAncestorIds.values().next().value as string)!;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // --- core state ------------------------------------------------------------
  const [workflowTemplates]           = useState<WorkflowTemplate[]>(SEED_TEMPLATES);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [activeRunId, setActiveRunId]   = useState<string | null>(null);
  const [selectedWorkflowTemplateId, setSelectedWorkflowTemplateId] = useState<string | null>(null);
  // --- UI state --------------------------------------------------------------
  const [selected, setSelected]   = useState<WorkflowNode | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [traceFile, setTraceFile] = useState<File | null>(null);
  const [backendRuns, setBackendRuns] = useState<RunSummary[]>([]);
  const [processOnly, setProcessOnly] = useState(false);
  const [failureIdx, setFailureIdx]   = useState(0);
  const [centreKey, setCentreKey]     = useState(0);
  const [running, setRunning]         = useState(false);
  const [summaryPane, setSummaryPane] = useState<SummaryPane | null>(null);
  const [openMenu, setOpenMenu]       = useState<string | null>(null);
  const [mode, setMode]               = useState<"debugger" | "workbench">("debugger");
  const [layout, setLayout]           = useState<"force" | "dag">("dag");
  const [graphView, setGraphView]     = useState<"process" | "full">("process");
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  // --- refs ------------------------------------------------------------------
  const fileRef  = useRef<HTMLInputElement>(null);
  const traceRef = useRef<HTMLInputElement>(null);
  // Track per-run simulation cleanup functions so they can be cancelled on unmount
  const simCleanups = useRef(new Map<string, () => void>());

  useEffect(() => {
    return () => { simCleanups.current.forEach((fn) => fn()); };
  }, []);

  // --- derived ---------------------------------------------------------------
  const activeRun = workflowRuns.find((r) => r.id === activeRunId) ?? null;

  const displayGraph = graphView === "process" && activeRun
    ? deriveProcessGraph(activeRun.nodes, activeRun.edges)
    : { nodes: activeRun?.nodes ?? [], edges: activeRun?.edges ?? [] };

  const failedNodes = displayGraph.nodes.filter((n) => n.status === "FAILED");
  const rootCauseNode = selected?.status === "FAILED"
    ? findRootCauseCandidate(selected, displayGraph.nodes, displayGraph.edges)
    : undefined;
  // Highlight the active entry in the backend-runs dropdown
  const activeBackendRunId = backendRuns.some((r) => r.run_id === activeRunId)
    ? (activeRunId ?? "")
    : "";
  // Show "Simulating…" label only when the currently-displayed run is a live demo
  const activeDemoRunning =
    activeRun?.status === "RUNNING" && activeRun.workflowTemplateId === "rnaseq-demo";

  // --- helpers ---------------------------------------------------------------
  function upsertRun(run: WorkflowRun) {
    setWorkflowRuns((prev) => {
      const idx = prev.findIndex((r) => r.id === run.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = run;
        return next;
      }
      return [...prev, run];
    });
  }

  // Wraps a loaded graph in a WorkflowRun and makes it active.
  // Same runId → the existing run is replaced (idempotent reload).
  function applyGraph(g: WorkflowGraph, opts: {
    runId: string; name: string; runSource: RunSource;
    reportAvailable?: boolean; timelineAvailable?: boolean;
  }) {
    const run: WorkflowRun = {
      id: opts.runId,
      workflowTemplateId: "uploaded",
      name: opts.name,
      runSource: opts.runSource,
      status: "COMPLETED",
      nodes: g.nodes,
      edges: g.edges,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      // Infer artefact availability from the parsed data for local runs
      dagAvailable: opts.runSource === "local-nextflow" ? true : undefined,
      traceAvailable: opts.runSource === "local-nextflow"
        ? g.nodes.some((n) => n.hash !== undefined)
        : undefined,
      reportAvailable:   opts.reportAvailable,
      timelineAvailable: opts.timelineAvailable,
    };
    upsertRun(run);
    setActiveRunId(opts.runId);
    setFailureIdx(0);
    const first = g.nodes.find((n) => n.status === "FAILED") ?? null;
    setSelected(first);
    if (first) {
      setCentreKey((k) => k + 1);
      setSummaryPane({ type: "debug-summary", nodeId: first.id });
    } else {
      setSummaryPane(null);
    }
  }

  // --- backend actions -------------------------------------------------------
  async function fetchBackendRuns() {
    try {
      const r = await fetch(`${API}/api/runs`);
      if (r.ok) setBackendRuns(await r.json());
    } catch { /* best-effort */ }
  }

  async function loadSample() {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API}/graph`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const g: WorkflowGraph = await r.json();
      const clean: WorkflowGraph = { ...g, nodes: g.nodes.map((n) => ({ ...n, status: "COMPLETED" as const })) };
      applyGraph(clean, { runId: "sample", name: "Sample run", runSource: "sample" });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadRun(run_id: string) {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/runs/${run_id}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${r.status}`);
      }
      const summary = backendRuns.find((s) => s.run_id === run_id);
      applyGraph(await r.json(), {
        runId: run_id,
        name: run_id,
        runSource: "local-nextflow",
        reportAvailable:   summary?.artefacts.report,
        timelineAvailable: summary?.artefacts.timeline,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function launchRun(opts?: { endpoint?: string; templateId?: string; displayName?: string }) {
    const endpoint    = opts?.endpoint    ?? "/api/runs/nf-core-demo-test";
    const templateId  = opts?.templateId  ?? "nf-core-demo";
    const displayName = opts?.displayName ?? "nf-core/demo";

    setError(null);
    setRunning(true);

    // Step 1 — POST to start the run. The backend returns immediately with a run_id.
    let runId: string;
    try {
      const r = await fetch(`${API}${endpoint}`, { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${r.status}`);
      }
      const result = await r.json() as { run_id: string };
      runId = result.run_id;
    } catch (e) {
      setError(String(e));
      setRunning(false);
      return;
    }
    setRunning(false);

    // Step 2 — Add a RUNNING run entry immediately so the user sees it in the sidebar.
    const shortId = runId.slice(0, 8);
    setWorkflowRuns((prev) => [
      ...prev,
      {
        id: runId,
        workflowTemplateId: templateId,
        name: `${displayName} (${shortId})`,
        runSource: "local-nextflow" as const,
        status: "RUNNING" as const,
        nodes: [],
        edges: [],
        startedAt: new Date().toISOString(),
        dagAvailable: false,
        traceAvailable: false,
      },
    ]);
    setActiveRunId(runId);
    setSelected(null);
    setFailureIdx(0);
    fetchBackendRuns();

    // Step 3 — Poll the status endpoint every 3 s.
    const pollTimer = setInterval(async () => {
      try {
        const sr = await fetch(`${API}/api/runs/${runId}/status`);
        if (!sr.ok) return;
        const st = await sr.json() as { status: string; dag_available: boolean; trace_available: boolean };

        // Keep artefact flags current on every tick so the inspector stays accurate.
        setWorkflowRuns((prev) =>
          prev.map((r) =>
            r.id === runId
              ? { ...r, dagAvailable: st.dag_available, traceAvailable: st.trace_available }
              : r,
          ),
        );

        // Refresh graph whenever the DAG file is available (may be mid-run with partial trace).
        if (st.dag_available && st.status === "running") {
          const gr = await fetch(`${API}/api/runs/${runId}`).catch(() => null);
          if (gr?.ok) {
            const g = await gr.json() as WorkflowGraph;
            setWorkflowRuns((prev) =>
              prev.map((r) => r.id === runId ? { ...r, nodes: g.nodes, edges: g.edges } : r),
            );
          }
        }

        // Run finished — do a final graph load, mark the run, stop polling.
        if (st.status !== "running") {
          clearInterval(pollTimer);
          simCleanups.current.delete(runId);

          const finalStatus: WorkflowRun["status"] =
            st.status === "completed" ? "COMPLETED" : "FAILED";

          let finalNodes: WorkflowNode[]       = [];
          let finalEdges: WorkflowGraph["edges"] = [];
          if (st.dag_available) {
            const gr = await fetch(`${API}/api/runs/${runId}`).catch(() => null);
            if (gr?.ok) {
              const g = await gr.json() as WorkflowGraph;
              finalNodes = g.nodes;
              finalEdges = g.edges;
            }
          }

          setWorkflowRuns((prev) =>
            prev.map((r) =>
              r.id === runId
                ? { ...r, status: finalStatus, completedAt: new Date().toISOString(), nodes: finalNodes, edges: finalEdges }
                : r,
            ),
          );

          const failed = finalNodes.find((n) => n.status === "FAILED") ?? null;
          if (failed) {
            setSelected(failed);
            setCentreKey((k) => k + 1);
            setSummaryPane({ type: "debug-summary", nodeId: failed.id });
          }

          fetchBackendRuns();
        }
      } catch { /* polling errors are silent — we will retry */ }
    }, 3000);

    simCleanups.current.set(runId, () => clearInterval(pollTimer));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    if (traceFile) form.append("trace", traceFile);
    try {
      const r = await fetch(`${API}/graph/upload`, { method: "POST", body: form });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${r.status}`);
      }
      applyGraph(await r.json(), { runId: `upload-${file.name}`, name: file.name, runSource: "upload" });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (traceRef.current) traceRef.current.value = "";
      setTraceFile(null);
    }
  }

  // --- demo simulation -------------------------------------------------------
  function startDemo() {
    setError(null);
    setSelectedWorkflowTemplateId("rnaseq-demo");

    const runId = `demo-${Date.now()}`;
    const demoCount = workflowRuns.filter((r) => r.workflowTemplateId === "rnaseq-demo").length;
    const runName = `RNA-seq demo #${demoCount + 1}`;
    const initial = getInitialDemoGraph();

    const newRun: WorkflowRun = {
      id: runId,
      workflowTemplateId: "rnaseq-demo",
      name: runName,
      runSource: "simulated",
      status: "RUNNING",
      nodes: initial.nodes,
      edges: initial.edges,
      startedAt: new Date().toISOString(),
    };

    setWorkflowRuns((prev) => [...prev, newRun]);
    setActiveRunId(runId);
    setSelected(null);
    setFailureIdx(0);

    // The simulation is deterministic — GATK_HAPLOTYPECALLER always fails.
    // Capture the final node shape now so onDone doesn't need to read stale state.
    const knownFailedNode: WorkflowNode = {
      ...initial.nodes.find((n) => n.id === "haplotype")!,
      status: "FAILED",
    };

    const cleanup = runDemoSimulation(setWorkflowRuns, runId, () => {
      setWorkflowRuns((prev) =>
        prev.map((r) =>
          r.id === runId
            ? { ...r, status: "FAILED", completedAt: new Date().toISOString() }
            : r,
        ),
      );
      setSelected(knownFailedNode);
      setCentreKey((k) => k + 1);
      setSummaryPane({ type: "debug-summary", nodeId: knownFailedNode.id });
    });

    simCleanups.current.set(runId, cleanup);
  }

  // --- summary pane -----------------------------------------------------------
  function handleOpenSummary(pane: SummaryPane) {
    setSummaryPane((current) => {
      if (!current) return pane;
      // Toggle off debug-summary when clicking Summary for the same node again
      if (current.type === "debug-summary" && pane.type === "debug-summary" && current.nodeId === pane.nodeId) {
        return null;
      }
      // No-op when clicking Report/Timeline that is already open
      if ((pane.type === "report" || pane.type === "timeline") && current.type === pane.type) {
        return current;
      }
      return pane;
    });
  }

  function handleSelectNode(node: WorkflowNode) {
    if (selected?.id === node.id) return;
    setSelected(node);
    if (node.status === "FAILED") {
      setSummaryPane((current) => {
        if (current?.type === "debug-summary" && current.nodeId === node.id) return current;
        return { type: "debug-summary", nodeId: node.id };
      });
    }
  }

  // --- graph navigation ------------------------------------------------------
  function jumpToNode(node: WorkflowNode) {
    if (selected?.id === node.id) return;
    handleSelectNode(node);
    setCentreKey((k) => k + 1);
  }

  function handleSelectTask(taskId: string) {
    if (selected?.id === taskId && graphView === "full") return;
    const node = activeRun?.nodes.find((n) => n.id === taskId);
    if (!node) return;
    setGraphView("full");
    setSummaryPane(null);   // clear task-list; handleSelectNode re-opens debug-summary for FAILED
    handleSelectNode(node);
    setCentreKey((k) => k + 1);
  }

  function jumpToNextFailure() {
    if (failedNodes.length === 0) return;
    const nextIdx = (failureIdx + 1) % failedNodes.length;
    setFailureIdx(nextIdx);
    handleSelectNode(failedNodes[nextIdx]);
    setCentreKey((k) => k + 1);
  }

  function switchRun(runId: string) {
    setActiveRunId(runId);
    setSelected(null);
    setFailureIdx(0);
    setSummaryPane(null);
  }

  // Auto-load the backend sample DAG and past-runs list on first render
  useEffect(() => { loadSample(); fetchBackendRuns(); }, []);

  // Sync report/timeline availability from backend into workflowRuns whenever backendRuns updates
  useEffect(() => {
    if (backendRuns.length === 0) return;
    setWorkflowRuns((prev) => prev.map((r) => {
      const s = backendRuns.find((br) => br.run_id === r.id);
      if (!s) return r;
      return { ...r, reportAvailable: s.artefacts.report, timelineAvailable: s.artefacts.timeline };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendRuns]);

  // Status banner shown as an overlay on the graph while a local run is in progress
  const localRunBanner = (() => {
    if (activeRun?.runSource !== "local-nextflow" || activeRun.status !== "RUNNING" || activeRun.nodes.length === 0) return null;
    const msg = activeRun.traceAvailable
      ? "Pipeline running… updating tasks"
      : "DAG ready… waiting for task updates";
    return <PulsingBanner message={msg} />;
  })();

  // suppress unused-variable warning for workflowTemplates (used by type system / future UI)
  void workflowTemplates;
  void selectedWorkflowTemplateId;

  // --- styles ----------------------------------------------------------------
  const s: Record<string, React.CSSProperties> = {
    root:    { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" },
    header:  { display: "flex", alignItems: "center", gap: 12, background: "#1e2130", borderBottom: "1px solid #2d3148", padding: "10px 20px" },
    appName: { fontSize: 14, fontWeight: 600, color: "#94a3b8", letterSpacing: 1 },
    divider: { width: 1, height: 20, background: "#2d3148", flexShrink: 0 },
    runSelect: { padding: "5px 10px", borderRadius: 6, fontSize: 13, background: "#2d3148", color: "#e2e8f0", border: "1px solid #3d4468", cursor: "pointer", maxWidth: 220 },
    spacer:  { flex: 1 },
    btn: { padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #3d4468", background: "#2d3148", color: "#e2e8f0" },
    primaryBtn: { display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "7px 20px", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", background: "#4f46e5", color: "#fff", lineHeight: 1.3 },
    primaryBtnSub: { fontSize: 10, fontWeight: 400, color: "#a5b4fc", letterSpacing: 0.2 },
    uploadBtn: { padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #3d4468", background: "transparent", color: "#94a3b8" },
    runBtn:  { padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #16a34a", background: "#14532d", color: "#86efac" },
    demoBtn: { padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #d97706", background: "#451a03", color: "#fcd34d" },
    infoStrip: { background: "#131620", borderBottom: "1px solid #2d3148", padding: "14px 20px" },
    infoTitle: { fontSize: 15, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 },
    infoSub:   { fontSize: 13, color: "#64748b", marginBottom: 6 },
    infoHint:  { fontSize: 12, color: "#475569" },
    body:    { display: "flex", flex: 1, overflow: "hidden", position: "relative" },
    // Runs sidebar
    sidebar:       { width: 180, minWidth: 180, background: "#131620", borderRight: "1px solid #2d3148", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 },
    sidebarTitle:  { fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: 1, padding: "10px 12px 6px", textTransform: "uppercase" as const, borderBottom: "1px solid #1e2130" },
    sidebarEmpty:  { fontSize: 12, color: "#475569", padding: "12px", fontStyle: "italic" },
    runItem:       { padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #1e2130", display: "flex", flexDirection: "column" as const, gap: 2 },
    runItemActive: { background: "#1e2130" },
    runName:       { fontSize: 12, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
    runMeta:       { display: "flex", alignItems: "center", gap: 5 },
    runStatusLabel:{ fontSize: 10, fontWeight: 500, letterSpacing: 0.3 },
    runSourceBadge:{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, borderRadius: 3, padding: "1px 4px", border: "1px solid" },
    footer:  { background: "#1e2130", borderTop: "1px solid #2d3148", padding: "8px 20px", fontSize: 12, color: "#475569", textAlign: "center" as const },
    message: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", background: "#0f1117" },
    errorBanner: { position: "absolute" as const, bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#7f1d1d", color: "#fecaca", padding: "8px 16px", borderRadius: 8, fontSize: 13, maxWidth: 480 },
  };

  // --- render ----------------------------------------------------------------
  return (
    <div style={s.root}>

      {/* ── Header ── */}
      <div style={s.header}>
        <span style={s.appName}>GENOLOOM</span>
        {backendRuns.length > 0 && (
          <>
            <div style={s.divider} />
            <select
              style={s.runSelect}
              value={activeBackendRunId}
              disabled={loading}
              onChange={(e) => { if (e.target.value) loadRun(e.target.value); }}
            >
              <option value="">Past runs…</option>
              {backendRuns.map((r) => {
                const label = r.display_name ?? r.name ?? r.run_id.slice(0, 8);
                const status = r.status ? ` · ${r.status.toLowerCase()}` : "";
                return <option key={r.run_id} value={r.run_id}>{label}{status}</option>;
              })}
            </select>
          </>
        )}
        {/* ── Mode switch ── */}
        <div style={{ display: "flex", background: "#131620", border: "1px solid #2d3148", borderRadius: 6, overflow: "hidden" }}>
          {(["debugger", "workbench"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none",
                background: mode === m ? "#4f46e5" : "transparent",
                color: mode === m ? "#fff" : "#64748b",
                textTransform: "capitalize",
              }}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <div style={s.spacer} />

        {/* ── View ── */}
        <DropdownMenu
          label="View"
          open={openMenu === "view"}
          onToggle={() => setOpenMenu((m) => m === "view" ? null : "view")}
        >
          <MenuItem onClick={() => { setGraphView("process"); setSelected(null); setSummaryPane(null); setFailureIdx(0); setOpenMenu(null); }}>
            {graphView === "process" ? "✓ " : "  "}Process view
          </MenuItem>
          <MenuItem onClick={() => { setGraphView("full"); setSelected(null); setSummaryPane(null); setFailureIdx(0); setOpenMenu(null); }}>
            {graphView === "full" ? "✓ " : "  "}Full DAG view
          </MenuItem>
          <MenuDivider />
          <MenuItem onClick={() => { setLayout("dag"); setOpenMenu(null); }}>
            {layout === "dag" ? "✓ " : "  "}DAG layout
          </MenuItem>
          <MenuItem onClick={() => { setLayout("force"); setOpenMenu(null); }}>
            {layout === "force" ? "✓ " : "  "}Force layout
          </MenuItem>
        </DropdownMenu>

        {/* ── Demo ── */}
        <DropdownMenu
          label={activeDemoRunning ? "Demo •" : "Demo"}
          triggerStyle={activeDemoRunning ? { borderColor: "#d97706", color: "#fcd34d", background: "#451a03" } : undefined}
          open={openMenu === "demo"}
          onToggle={() => setOpenMenu((m) => m === "demo" ? null : "demo")}
        >
          <MenuItem onClick={() => { loadSample(); setOpenMenu(null); }} disabled={loading}>
            Sample completed run
          </MenuItem>
          <MenuItem onClick={() => { startDemo(); setOpenMenu(null); }} disabled={activeDemoRunning}>
            {activeDemoRunning ? "Simulating…" : "RNA-seq failure demo"}
          </MenuItem>
        </DropdownMenu>

        {/* ── Upload ── */}
        <DropdownMenu
          label="Upload"
          open={openMenu === "upload"}
          onToggle={() => setOpenMenu((m) => m === "upload" ? null : "upload")}
        >
          <MenuItem onClick={() => { fileRef.current?.click(); setOpenMenu(null); }} disabled={loading}>
            Upload dag.dot
          </MenuItem>
          <MenuDivider />
          <MenuItem onClick={() => { traceRef.current?.click(); setOpenMenu(null); }} disabled={loading}>
            {traceFile ? `✓ trace.txt staged` : "Add trace.txt"}
          </MenuItem>
        </DropdownMenu>

        {/* ── Run ── */}
        <DropdownMenu
          label="Run"
          triggerStyle={{ borderColor: VIEWER_MODE ? "#374151" : "#16a34a", background: VIEWER_MODE ? "#1a1f2e" : "#14532d", color: VIEWER_MODE ? "#4b5563" : "#86efac" }}
          open={!VIEWER_MODE && openMenu === "run"}
          onToggle={() => { if (!VIEWER_MODE) setOpenMenu((m) => m === "run" ? null : "run"); }}
          disabled={VIEWER_MODE}
          title={VIEWER_MODE ? "Runner unavailable in Docker viewer mode" : undefined}
        >
          <MenuItem onClick={() => { launchRun(); setOpenMenu(null); }} disabled={running || loading}>
            {running ? "Running…" : "Run nf-core/demo"}
          </MenuItem>
          <div style={{ padding: "4px 10px 6px", fontSize: 10, color: "#475569", lineHeight: 1.4 }}>
            Requires Nextflow + Docker
          </div>
        </DropdownMenu>

        <input ref={traceRef} type="file" accept=".txt,text/plain" style={{ display: "none" }} onChange={(e) => setTraceFile(e.target.files?.[0] ?? null)} />
        <input ref={fileRef} type="file" accept=".dot,text/plain" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {/* ── Workbench mode ── */}
      {mode === "workbench" && (
        <div style={{ flex: 1, overflowY: "auto", background: "#0f1117", padding: "32px 40px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>nf-core Workbench</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: VIEWER_MODE ? 12 : 24 }}>Configure and launch approved nf-core workflows locally</div>
            {VIEWER_MODE && (
              <div style={{ background: "#1a1f0a", border: "1px solid #3d4a1a", borderRadius: 6, padding: "8px 14px", marginBottom: 20, fontSize: 12, color: "#a3b86c" }}>
                Running pipelines is not available in Docker viewer mode. To launch workflows, run the app natively — see the README for setup instructions.
              </div>
            )}

            {/* nf-core/demo — runnable */}
            <div style={{ background: "#131620", border: "1px solid #2d3148", borderRadius: 8, padding: "18px 20px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>nf-core/demo</span>
                  {VIEWER_MODE
                    ? <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 3, background: "#1e2130", color: "#64748b", border: "1px solid #2d3148" }}>View only</span>
                    : <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 3, background: "#14532d", color: "#86efac", border: "1px solid #16a34a" }}>Runnable</span>
                  }
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Small nf-core demo pipeline for local testing</div>
              </div>
              <button
                onClick={() => launchRun()}
                disabled={VIEWER_MODE || running || loading}
                title={VIEWER_MODE ? "Runner unavailable in Docker viewer mode" : undefined}
                style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: VIEWER_MODE || running || loading ? "not-allowed" : "pointer", border: "1px solid #16a34a", background: "#14532d", color: "#86efac", opacity: VIEWER_MODE || running || loading ? 0.4 : 1, flexShrink: 0 }}
              >
                {running ? "Running…" : "Run"}
              </button>
            </div>

            {/* nf-core/rnaseq — test profile */}
            <div style={{ background: "#131620", border: "1px solid #2d3148", borderRadius: 8, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>nf-core/rnaseq</span>
                  {VIEWER_MODE
                    ? <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 3, background: "#1e2130", color: "#64748b", border: "1px solid #2d3148" }}>View only</span>
                    : <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 3, background: "#14532d", color: "#86efac", border: "1px solid #16a34a" }}>Runnable</span>
                  }
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>RNA-seq analysis workflow from nf-core</div>
              </div>
              <button
                onClick={() => launchRun({ endpoint: "/api/runs/nf-core-rnaseq-test", templateId: "nf-core-rnaseq", displayName: "nf-core/rnaseq" })}
                disabled={VIEWER_MODE || running || loading}
                title={VIEWER_MODE ? "Runner unavailable in Docker viewer mode" : undefined}
                style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: VIEWER_MODE || running || loading ? "not-allowed" : "pointer", border: "1px solid #16a34a", background: "#14532d", color: "#86efac", opacity: VIEWER_MODE || running || loading ? 0.4 : 1, flexShrink: 0 }}
              >
                {running ? "Running…" : "Run test profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Info strip + body (Debugger mode) ── */}
      {mode === "debugger" && <>
      <div style={s.infoStrip}>
        <div style={s.infoTitle}>GenoLoom Flow Viewer</div>
        <div style={s.infoSub}>
          Upload a Nextflow dag.dot file to visualise and explore your workflow graph interactively.
        </div>
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 6 }}>
          Quickly identify failed steps and understand workflow dependencies
        </div>
        <div style={s.infoHint}>
          Tip: Generate a dag.dot file using:{" "}
          <code style={{ color: "#94a3b8" }}>nextflow run &lt;pipeline&gt; -with-dag dag.dot</code>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={s.body}>

        {/* Runs sidebar */}
        <div style={s.sidebar}>
          <div style={s.sidebarTitle}>Runs</div>
          {workflowRuns.length === 0 ? (
            <div style={s.sidebarEmpty}>{VIEWER_MODE ? "Use Demo or Upload to load a run." : "No runs yet"}</div>
          ) : (
            [...workflowRuns].reverse().map((run) => (
              <div
                key={run.id}
                style={run.id === activeRunId ? { ...s.runItem, ...s.runItemActive } : s.runItem}
                onClick={() => switchRun(run.id)}
              >
                <div style={s.runName} title={run.name}>{run.name}</div>
                <div style={s.runMeta}>
                  <span style={{
                    ...s.runSourceBadge,
                    color: RUN_SOURCE_CONFIG[run.runSource].color,
                    borderColor: `${RUN_SOURCE_CONFIG[run.runSource].color}50`,
                    background: `${RUN_SOURCE_CONFIG[run.runSource].color}18`,
                  }}>
                    {RUN_SOURCE_CONFIG[run.runSource].label}
                  </span>
                  <span style={{ ...s.runStatusLabel, color: RUN_STATUS_COLOUR[run.status] }}>
                    {run.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Graph area */}
        {loading && !activeRun ? (
          <div style={s.message}>Loading…</div>
        ) : activeRun?.status === "RUNNING" && activeRun.nodes.length === 0 ? (
          <div style={s.message}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <svg width="22" height="22">
                <circle cx="11" cy="11" r="9" fill="none" stroke="#f59e0b" strokeWidth="1.5">
                  <animate attributeName="opacity" values="1;0.15;1" dur="1.4s" repeatCount="indefinite" />
                </circle>
              </svg>
              <span style={{ fontSize: 13 }}>
                {activeRun.dagAvailable
                  ? "DAG ready… waiting for task updates"
                  : "Pipeline starting… waiting for DAG"}
              </span>
            </div>
          </div>
        ) : activeRun ? (
          <>
            <Graph
              nodes={displayGraph.nodes}
              edges={displayGraph.edges}
              selectedId={selected?.id ?? null}
              onSelect={handleSelectNode}
              onDeselect={() => { setSelected(null); setSummaryPane(null); }}
              processOnly={graphView === "full" ? processOnly : false}
              centreKey={centreKey}
              layout={layout}
              statusBanner={localRunBanner}
              hoveredTaskId={hoveredTaskId}
            />
            {summaryPane && (
              <SummaryPanel
                pane={summaryPane}
                onClose={() => setSummaryPane(null)}
                node={selected}
                run={activeRun}
                onOpenPane={handleOpenSummary}
                onSelectTask={handleSelectTask}
                onHoverTask={setHoveredTaskId}
              />
            )}
            <NodeInspector
              node={selected}
              run={activeRun}
              onDeselect={() => { setSelected(null); setSummaryPane(null); }}
              onOpenSummary={handleOpenSummary}
              rootCause={rootCauseNode}
              onJumpToNode={jumpToNode}
            />
          </>
        ) : (
          <div style={s.message}>{VIEWER_MODE ? "Docker viewer mode — use Demo or Upload to load a run." : "No graph loaded."}</div>
        )}

        {/* Jump-to-failure overlay */}
        {failedNodes.length > 0 && (
          <button
            onClick={jumpToNextFailure}
            style={{
              position: "absolute",
              top: 12,
              left: 193, // 180px sidebar + 1px border + 12px padding
              zIndex: 10,
              padding: "5px 12px",
              background: "#450a0a",
              color: "#fca5a5",
              border: "1px solid #7f1d1d",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ⚠ {failedNodes.length} failed — jump ({failureIdx + 1}/{failedNodes.length})
          </button>
        )}

        {/* Process node count detail */}
        {graphView === "process" && selected?.taskCount !== undefined && (
          <div style={{
            position: "absolute", bottom: 20, right: 12, zIndex: 10,
            background: "rgba(19,22,32,0.95)", border: "1px solid #2d3148",
            borderRadius: 6, padding: "10px 14px", fontSize: 12,
            color: "#e2e8f0", lineHeight: 1.8, pointerEvents: "none",
          }}>
            <div style={{ fontWeight: 600, color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>
              {selected.label}
            </div>
            <div>Tasks: {selected.taskCount}</div>
            {!!selected.completedCount && <div style={{ color: "#22c55e" }}>{selected.completedCount} completed</div>}
            {!!selected.failedCount    && <div style={{ color: "#ef4444" }}>{selected.failedCount} failed</div>}
            {!!selected.runningCount   && <div style={{ color: "#f59e0b" }}>{selected.runningCount} running</div>}
            {!!selected.unknownCount   && <div style={{ color: "#9ca3af" }}>{selected.unknownCount} unknown</div>}
          </div>
        )}

        {error && !(VIEWER_MODE && workflowRuns.length === 0) && <div style={s.errorBanner}>{error}</div>}
      </div>
      </>}

      <div style={s.footer}>Built by Philip Lobb • GenoLoom</div>
    </div>
  );
}
