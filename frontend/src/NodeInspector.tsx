import { WorkflowNode } from "./types";

const STATUS_COLOUR: Record<string, string> = {
  COMPLETED: "#22c55e",
  FAILED: "#ef4444",
  CACHED: "#3b82f6",
  SKIPPED: "#9ca3af",
  UNKNOWN: "#9ca3af",
};

type Props = {
  node: WorkflowNode | null;
};

export default function NodeInspector({ node }: Props) {
  const styles: Record<string, React.CSSProperties> = {
    panel: {
      width: 300,
      minWidth: 300,
      background: "#1e2130",
      borderLeft: "1px solid #2d3148",
      padding: 20,
      overflowY: "auto",
    },
    empty: {
      color: "#64748b",
      fontSize: 14,
      marginTop: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      marginBottom: 16,
      color: "#f1f5f9",
    },
    badge: {
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      color: "#0f1117",
      marginBottom: 16,
    },
    row: {
      display: "flex",
      justifyContent: "space-between",
      padding: "6px 0",
      borderBottom: "1px solid #2d3148",
      fontSize: 13,
    },
    key: { color: "#94a3b8" },
    value: { color: "#e2e8f0", textAlign: "right", maxWidth: 160, wordBreak: "break-all" },
  };

  if (!node) {
    return (
      <div style={styles.panel}>
        <div style={styles.title}>Inspector</div>
        <div style={styles.empty}>Click a node to inspect it.</div>
      </div>
    );
  }

  const colour = STATUS_COLOUR[node.status ?? "UNKNOWN"];

  const rows: [string, string | number | undefined][] = [
    ["Process", node.processName],
    ["Status", node.status],
    ["Exit code", node.exitCode],
    ["Duration", node.duration],
    ["CPUs", node.cpus],
    ["Memory", node.memory],
    ["Work dir", node.workDir],
  ];

  return (
    <div style={styles.panel}>
      <div style={styles.title}>{node.label}</div>
      {node.status && (
        <span style={{ ...styles.badge, background: colour }}>{node.status}</span>
      )}
      {rows
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => (
          <div key={k} style={styles.row}>
            <span style={styles.key}>{k}</span>
            <span style={styles.value}>{String(v)}</span>
          </div>
        ))}
    </div>
  );
}
