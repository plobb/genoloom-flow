import { useEffect, useRef, useState } from "react";
import Graph from "./Graph";
import NodeInspector from "./NodeInspector";
import { WorkflowGraph, WorkflowNode } from "./types";

const API = "http://localhost:8000";

export default function App() {
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [selected, setSelected] = useState<WorkflowNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [traceFile, setTraceFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const traceRef = useRef<HTMLInputElement>(null);

  async function loadSample() {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API}/graph`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setGraph(await r.json());
      setSelected(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
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
      setGraph(await r.json());
      setSelected(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (traceRef.current) traceRef.current.value = "";
      setTraceFile(null);
    }
  }

  // Auto-load the sample DAG on first render
  useEffect(() => { loadSample(); }, []);

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
    appName: { fontSize: 14, fontWeight: 600, color: "#94a3b8", letterSpacing: 1, marginRight: "auto" },
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
    uploadBtn: {
      padding: "6px 14px",
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      border: "none",
      background: "#4f46e5",
      color: "#fff",
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
        <button style={styles.btn} onClick={loadSample} disabled={loading}>
          Load sample
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
        <input ref={traceRef} type="file" accept=".txt,text/plain" style={{ display: "none" }} onChange={(e) => setTraceFile(e.target.files?.[0] ?? null)} />
        <input ref={fileRef} type="file" accept=".dot,text/plain" style={{ display: "none" }} onChange={handleFile} />
      </div>

      <div style={styles.infoStrip}>
        <div style={styles.infoTitle}>GenoLoom Flow Viewer</div>
        <div style={styles.infoSub}>
          Upload a Nextflow dag.dot file to visualise and explore your workflow graph interactively.
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
            />
            <NodeInspector node={selected} />
          </>
        ) : (
          <div style={styles.message}>No graph loaded.</div>
        )}

        {error && <div style={styles.errorBanner}>{error}</div>}
      </div>

      <div style={styles.footer}>Built by Philip Lobb • GenoLoom</div>
    </div>
  );
}
