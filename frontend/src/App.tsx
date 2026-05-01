import { useEffect, useRef, useState } from "react";
import Graph from "./Graph";
import NodeInspector from "./NodeInspector";
import SummaryPanel from "./SummaryPanel";
import { WorkflowGraph, WorkflowNode, WorkflowRun, WorkflowTemplate, RunSummary, RunSource, SummaryPane } from "./types";
import { getInitialDemoGraph, runDemoSimulation } from "./demoWorkflow";

const API = "http://localhost:8000";

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
  // --- refs ------------------------------------------------------------------
  const fileRef  = useRef<HTMLInputElement>(null);
  const traceRef = useRef<HTMLInputElement>(null);
  // Track per-run simulation cleanup functions so they can be cancelled on unmount
  const simCleanups = useRef(new Map<string, () => void>());

  useEffect(() => {
    return () => { simCleanups.current.forEach((fn) => fn()); };
  }, []);

  // --- derived ---------------------------------------------------------------
  const activeRun   = workflowRuns.find((r) => r.id === activeRunId) ?? null;
  const failedNodes = activeRun?.nodes.filter((n) => n.status === "FAILED") ?? [];
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
  function applyGraph(g: WorkflowGraph, opts: { runId: string; name: string; runSource: RunSource }) {
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
      applyGraph(await r.json(), { runId: "sample", name: "Sample run", runSource: "sample" });
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
      applyGraph(await r.json(), { runId: run_id, name: run_id, runSource: "local-nextflow" });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function launchRun() {
    setError(null);
    setRunning(true);

    // Step 1 — POST to start the run. The backend returns immediately with a run_id.
    let runId: string;
    try {
      const r = await fetch(`${API}/api/runs/nf-core-demo-test`, { method: "POST" });
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
        workflowTemplateId: "nf-core-demo",
        name: `nf-core/demo (${shortId})`,
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

  // --- graph navigation ------------------------------------------------------
  function jumpToNextFailure() {
    if (failedNodes.length === 0) return;
    const nextIdx = (failureIdx + 1) % failedNodes.length;
    setFailureIdx(nextIdx);
    setSelected(failedNodes[nextIdx]);
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
              {backendRuns.map((r) => (
                <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
              ))}
            </select>
          </>
        )}
        <div style={s.spacer} />
        <button
          style={processOnly ? { ...s.btn, borderColor: "#4f46e5", color: "#818cf8" } : s.btn}
          onClick={() => { setProcessOnly((p) => !p); setSelected(null); setSummaryPane(null); }}
          title="Toggle between full DAG and process nodes only"
        >
          {processOnly ? "Process only" : "Full DAG"}
        </button>
        <div style={s.divider} />
        <button style={s.primaryBtn} onClick={loadSample} disabled={loading}>
          Load sample
          <span style={s.primaryBtnSub}>Try a demo</span>
        </button>
        <button style={s.demoBtn} onClick={startDemo} title="Simulate a demo RNA-seq workflow with one failing node">
          {activeDemoRunning ? "Simulating…" : "Run demo workflow"}
        </button>
        <button
          style={traceFile ? { ...s.btn, borderColor: "#22c55e", color: "#22c55e" } : s.btn}
          onClick={() => traceRef.current?.click()}
          disabled={loading}
          title={traceFile ? `trace.txt staged: ${traceFile.name}` : "Optionally add a trace.txt to colour nodes by status"}
        >
          {traceFile ? "trace.txt staged" : "+ trace.txt"}
        </button>
        <button style={s.uploadBtn} onClick={() => fileRef.current?.click()} disabled={loading}>
          Upload dag.dot
        </button>
        <div style={s.divider} />
        <button
          style={s.runBtn}
          onClick={launchRun}
          disabled={running || loading}
          title="Run nf-core/demo with the test profile (requires Nextflow + Docker)"
        >
          {running ? "Running…" : "Run nf-core/demo"}
        </button>
        <input ref={traceRef} type="file" accept=".txt,text/plain" style={{ display: "none" }} onChange={(e) => setTraceFile(e.target.files?.[0] ?? null)} />
        <input ref={fileRef} type="file" accept=".dot,text/plain" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {/* ── Info strip ── */}
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
            <div style={s.sidebarEmpty}>No runs yet</div>
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
              nodes={activeRun.nodes}
              edges={activeRun.edges}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              onDeselect={() => { setSelected(null); setSummaryPane(null); }}
              processOnly={processOnly}
              centreKey={centreKey}
              statusBanner={localRunBanner}
            />
            {summaryPane && (
              <SummaryPanel
                pane={summaryPane}
                onClose={() => setSummaryPane(null)}
                node={selected}
                run={activeRun}
              />
            )}
            <NodeInspector
              node={selected}
              run={activeRun}
              onDeselect={() => { setSelected(null); setSummaryPane(null); }}
              onOpenSummary={setSummaryPane}
            />
          </>
        ) : (
          <div style={s.message}>No graph loaded.</div>
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

        {error && <div style={s.errorBanner}>{error}</div>}
      </div>

      <div style={s.footer}>Built by Philip Lobb • GenoLoom</div>
    </div>
  );
}
