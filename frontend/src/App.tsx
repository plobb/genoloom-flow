import { useEffect, useRef, useState } from "react";
import Graph from "./Graph";
import NodeInspector from "./NodeInspector";
import DebugSummary from "./DebugSummary";
import { WorkflowGraph, WorkflowNode, RunSummary } from "./types";

const API = "http://localhost:8000";

export default function App() {
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [selected, setSelected] = useState<WorkflowNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [traceFile, setTraceFile] = useState<File | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>("");
  const [processOnly, setProcessOnly] = useState(false);
  const [failureIdx, setFailureIdx] = useState(0);
  const [centreKey, setCentreKey] = useState(0);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const traceRef = useRef<HTMLInputElement>(null);

  async function fetchRuns() {
    try {
      const r = await fetch(`${API}/api/runs`);
      if (r.ok) setRuns(await r.json());
    } catch {
      // Runs list is best-effort; don't surface errors for this
    }
  }

  function applyGraph(g: WorkflowGraph) {
    setGraph(g);
    setFailureIdx(0);
    const first = g.nodes.find((n) => n.status === "FAILED") ?? null;
    setSelected(first);
    if (first) setCentreKey((k) => k + 1);
  }

  async function loadSample() {
    setError(null);
    setLoading(true);
    setActiveRunId("");
    try {
      const r = await fetch(`${API}/graph`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      applyGraph(await r.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadRun(run_id: string) {
    setError(null);
    setLoading(true);
    setActiveRunId(run_id);
    try {
      const r = await fetch(`${API}/api/runs/${run_id}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${r.status}`);
      }
      applyGraph(await r.json());
    } catch (e) {
      setError(String(e));
      setActiveRunId("");
    } finally {
      setLoading(false);
    }
  }

  async function launchRun() {
    setError(null);
    setRunning(true);
    try {
      const r = await fetch(`${API}/api/runs/nf-core-demo-test`, { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${r.status}`);
      }
      const result = await r.json() as { run_id: string; status: string };
      await fetchRuns();
      await loadRun(result.run_id);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    setActiveRunId("");
    const form = new FormData();
    form.append("file", file);
    if (traceFile) form.append("trace", traceFile);
    try {
      const r = await fetch(`${API}/graph/upload`, { method: "POST", body: form });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${r.status}`);
      }
      applyGraph(await r.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (traceRef.current) traceRef.current.value = "";
      setTraceFile(null);
    }
  }

  const failedNodes = graph?.nodes.filter((n) => n.status === "FAILED") ?? [];

  function jumpToNextFailure() {
    if (failedNodes.length === 0) return;
    const nextIdx = (failureIdx + 1) % failedNodes.length;
    setFailureIdx(nextIdx);
    setSelected(failedNodes[nextIdx]);
    setCentreKey((k) => k + 1);
  }

  // Auto-load the sample DAG and runs list on first render
  useEffect(() => { loadSample(); fetchRuns(); }, []);

  const styles: Record<string, React.CSSProperties> = {
    root: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "#1e2130",
      borderBottom: "1px solid #2d3148",
      padding: "10px 20px",
    },
    appName: { fontSize: 14, fontWeight: 600, color: "#94a3b8", letterSpacing: 1 },
    divider: { width: 1, height: 20, background: "#2d3148", flexShrink: 0 },
    runSelect: {
      padding: "5px 10px",
      borderRadius: 6,
      fontSize: 13,
      background: "#2d3148",
      color: "#e2e8f0",
      border: "1px solid #3d4468",
      cursor: "pointer",
      maxWidth: 220,
    },
    spacer: { flex: 1 },
    btn: {
      padding: "6px 14px",
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      border: "1px solid #3d4468",
      background: "#2d3148",
      color: "#e2e8f0",
    },
    primaryBtn: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      padding: "7px 20px",
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      border: "none",
      background: "#4f46e5",
      color: "#fff",
      lineHeight: 1.3,
    },
    primaryBtnSub: {
      fontSize: 10,
      fontWeight: 400,
      color: "#a5b4fc",
      letterSpacing: 0.2,
    },
    uploadBtn: {
      padding: "6px 14px",
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      border: "1px solid #3d4468",
      background: "transparent",
      color: "#94a3b8",
    },
    runBtn: {
      padding: "6px 14px",
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      border: "1px solid #16a34a",
      background: "#14532d",
      color: "#86efac",
    },
    infoStrip: {
      background: "#131620",
      borderBottom: "1px solid #2d3148",
      padding: "14px 20px",
    },
    infoTitle: { fontSize: 15, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 },
    infoSub: { fontSize: 13, color: "#64748b", marginBottom: 6 },
    infoHint: { fontSize: 12, color: "#475569" },
    body: { display: "flex", flex: 1, overflow: "hidden", position: "relative" },
    footer: {
      background: "#1e2130",
      borderTop: "1px solid #2d3148",
      padding: "8px 20px",
      fontSize: 12,
      color: "#475569",
      textAlign: "center" as const,
    },
    message: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", background: "#0f1117" },
    errorBanner: {
      position: "absolute" as const,
      bottom: 20,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#7f1d1d",
      color: "#fecaca",
      padding: "8px 16px",
      borderRadius: 8,
      fontSize: 13,
      maxWidth: 480,
    },
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.appName}>GENOLOOM</span>
        {runs.length > 0 && (
          <>
            <div style={styles.divider} />
            <select
              style={styles.runSelect}
              value={activeRunId}
              disabled={loading}
              onChange={(e) => { if (e.target.value) loadRun(e.target.value); }}
            >
              <option value="">Past runs…</option>
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
              ))}
            </select>
          </>
        )}
        <div style={styles.spacer} />
        <button
          style={processOnly
            ? { ...styles.btn, borderColor: "#4f46e5", color: "#818cf8" }
            : styles.btn}
          onClick={() => { setProcessOnly((p) => !p); setSelected(null); }}
          title="Toggle between full DAG and process nodes only"
        >
          {processOnly ? "Process only" : "Full DAG"}
        </button>
        <div style={styles.divider} />
        <button style={styles.primaryBtn} onClick={loadSample} disabled={loading}>
          Load sample
          <span style={styles.primaryBtnSub}>Try a demo</span>
        </button>
        <button
          style={traceFile ? { ...styles.btn, borderColor: "#22c55e", color: "#22c55e" } : styles.btn}
          onClick={() => traceRef.current?.click()}
          disabled={loading}
          title={traceFile ? `trace.txt staged: ${traceFile.name}` : "Optionally add a trace.txt to colour nodes by status"}
        >
          {traceFile ? "trace.txt staged" : "+ trace.txt"}
        </button>
        <button style={styles.uploadBtn} onClick={() => fileRef.current?.click()} disabled={loading}>
          Upload dag.dot
        </button>
        <div style={styles.divider} />
        <button
          style={styles.runBtn}
          onClick={launchRun}
          disabled={running || loading}
          title="Run nf-core/demo with the test profile (requires Nextflow + Docker)"
        >
          {running ? "Running…" : "Run nf-core/demo"}
        </button>
        <input ref={traceRef} type="file" accept=".txt,text/plain" style={{ display: "none" }} onChange={(e) => setTraceFile(e.target.files?.[0] ?? null)} />
        <input ref={fileRef} type="file" accept=".dot,text/plain" style={{ display: "none" }} onChange={handleFile} />
      </div>

      <div style={styles.infoStrip}>
        <div style={styles.infoTitle}>GenoLoom Flow Viewer</div>
        <div style={styles.infoSub}>
          Upload a Nextflow dag.dot file to visualise and explore your workflow graph interactively.
        </div>
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 6 }}>
          Quickly identify failed steps and understand workflow dependencies
        </div>
        <div style={styles.infoHint}>
          Tip: Generate a dag.dot file using:{" "}
          <code style={{ color: "#94a3b8" }}>nextflow run &lt;pipeline&gt; -with-dag dag.dot</code>
        </div>
      </div>

      <div style={styles.body}>
        {loading && !graph ? (
          <div style={styles.message}>Loading…</div>
        ) : graph ? (
          <>
            <Graph
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              processOnly={processOnly}
              centreKey={centreKey}
            />
            <DebugSummary node={selected} />
            <NodeInspector node={selected} />
          </>
        ) : (
          <div style={styles.message}>No graph loaded.</div>
        )}

        {failedNodes.length > 0 && (
          <button
            onClick={jumpToNextFailure}
            style={{
              position: "absolute",
              top: 12,
              left: 12,
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
        {error && <div style={styles.errorBanner}>{error}</div>}
      </div>

      <div style={styles.footer}>Built by Philip Lobb • GenoLoom</div>
    </div>
  );
}
