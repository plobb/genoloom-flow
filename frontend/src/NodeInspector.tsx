import { WorkflowNode } from "./types";

const STATUS_COLOUR: Record<string, string> = {
  COMPLETED: "#22c55e",
  FAILED: "#ef4444",
  CACHED: "#3b82f6",
  SKIPPED: "#9ca3af",
  UNKNOWN: "#9ca3af",
};

type Row = [string, string | number | undefined];

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
    sectionLabel: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 1,
      color: "#475569",
      textTransform: "uppercase" as const,
      marginTop: 16,
      marginBottom: 4,
    },
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

  const basicRows: Row[] = [
    ["Process", node.processName],
    ["Status", node.status],
    ["Exit code", node.exitCode],
    ["Duration", node.duration],
    ["CPUs", node.cpus],
    ["Memory", node.memory],
  ];

  const traceRows: Row[] = [
    ["Realtime", node.realtime],
    ["CPU", node.cpu_pct],
    ["Peak RSS", node.peak_rss],
    ["Peak VMem", node.peak_vmem],
    ["Read", node.rchar],
    ["Written", node.wchar],
    ["Submit", node.submit],
    ["Hash", node.hash],
    ["Task ID", node.task_id],
    ["Native ID", node.native_id],
  ];

  const visibleTrace = traceRows.filter(([, v]) => v !== undefined && v !== null);

  const pathRows: Row[] = [
    ["Work dir", node.workDir],
    ["Command", node.commandPath],
    ["Stdout", node.stdoutPath],
    ["Stderr", node.stderrPath],
  ];
  const visiblePaths = pathRows.filter(([, v]) => v !== undefined && v !== null);

  const renderRow = ([k, v]: Row) => (
    <div key={k} style={styles.row}>
      <span style={styles.key}>{k}</span>
      <span style={styles.value}>{String(v)}</span>
    </div>
  );

  return (
    <div style={styles.panel}>
      <div style={styles.title}>{node.label}</div>
      {node.status && (
        <span style={{ ...styles.badge, background: colour }}>{node.status}</span>
      )}
      {basicRows.filter(([, v]) => v !== undefined && v !== null).map(renderRow)}
      {visibleTrace.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Trace</div>
          {visibleTrace.map(renderRow)}
        </>
      )}
      {visiblePaths.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Paths</div>
          {visiblePaths.map(renderRow)}
        </>
      )}
    </div>
  );
}
