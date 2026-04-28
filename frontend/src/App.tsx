import { useEffect, useState } from "react";
import Graph from "./Graph";
import NodeInspector from "./NodeInspector";
import { WorkflowGraph, WorkflowNode } from "./types";

const API = "http://localhost:8000";

export default function App() {
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [selected, setSelected] = useState<WorkflowNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/graph`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setGraph)
      .catch((e) => setError(String(e)));
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    root: { display: "flex", flexDirection: "column", height: "100vh" },
    header: {
      background: "#1e2130",
      borderBottom: "1px solid #2d3148",
      padding: "12px 20px",
      fontSize: 14,
      fontWeight: 600,
      color: "#94a3b8",
      letterSpacing: 1,
    },
    body: { display: "flex", flex: 1, overflow: "hidden" },
    message: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" },
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>NEXFLOW DEBUGGER</div>
      <div style={styles.body}>
        {error ? (
          <div style={styles.message}>
            Failed to load graph: {error}. Is the backend running?
          </div>
        ) : !graph ? (
          <div style={styles.message}>Loading…</div>
        ) : (
          <>
            <Graph
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
            <NodeInspector node={selected} />
          </>
        )}
      </div>
    </div>
  );
}
