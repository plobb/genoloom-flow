import { useState } from "react";
import { WorkflowNode, WorkflowRun, RunSource, SummaryPane } from "./types";

const STATUS_COLOUR: Record<string, string> = {
  COMPLETED: "#22c55e",
  FAILED: "#ef4444",
  CACHED: "#3b82f6",
  SKIPPED: "#9ca3af",
  UNKNOWN: "#9ca3af",
};

type Row = [string, string | number | undefined];

const RUN_SOURCE_CONFIG: Record<RunSource, { label: string; color: string }> = {
  "sample":         { label: "SAMPLE", color: "#60a5fa" },
  "simulated":      { label: "DEMO",   color: "#fbbf24" },
  "upload":         { label: "UPLOAD", color: "#a78bfa" },
  "local-nextflow": { label: "LOCAL",  color: "#4ade80" },
};

const RUN_STATUS_COLOUR: Record<WorkflowRun["status"], string> = {
  PENDING: "#9ca3af", RUNNING: "#f59e0b", COMPLETED: "#22c55e", FAILED: "#ef4444",
};

const WORKFLOW_DISPLAY: Record<string, string> = {
  "nf-core-demo": "nf-core/demo",
  "rnaseq-demo":  "RNA-seq demo",
  "uploaded":     "Uploaded",
  "sample":       "Sample",
};

type Props = {
  node: WorkflowNode | null;
  run?: WorkflowRun | null;
  onDeselect?: () => void;
  onOpenSummary?: (pane: SummaryPane) => void;
};

export default function NodeInspector({ node, run, onDeselect, onOpenSummary }: Props) {
  const [deselectHover, setDeselectHover] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    panel: {
      width: 300,
      minWidth: 300,
      background: "#1e2130",
      borderLeft: "1px solid #2d3148",
      padding: 20,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
    },
    empty: { color: "#64748b", fontSize: 14, marginTop: 8 },
    title: { fontSize: 16, fontWeight: 600, color: "#f1f5f9" },
    badge: {
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      color: "#0f1117",
      marginBottom: 12,
    },
    row: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "6px 0",
      borderBottom: "1px solid #2d3148",
      fontSize: 13,
    },
    key:   { color: "#94a3b8", flexShrink: 0 },
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
    fileBtn: {
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 4,
      border: "1px solid #3d4468",
      background: "#2d3148",
      color: "#94a3b8",
      cursor: "pointer",
      flexShrink: 0,
    },
    summaryBtn: {
      fontSize: 11,
      padding: "3px 10px",
      borderRadius: 4,
      border: "1px solid #4f46e5",
      background: "#2d3148",
      color: "#818cf8",
      cursor: "pointer",
      marginBottom: 12,
      alignSelf: "flex-start" as const,
    },
    deselectBtn: {
      width: 22,
      height: 22,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      border: "1px solid #3d4468",
      background: deselectHover ? "#3d4468" : "#2d3148",
      color: deselectHover ? "#e2e8f0" : "#64748b",
      cursor: "pointer",
      padding: 0,
      fontSize: 13,
      lineHeight: 1,
      flexShrink: 0,
      transition: "background 0.1s, color 0.1s",
    },
  };

  if (!node) {
    if (!run) {
      return (
        <div style={styles.panel}>
          <div style={{ ...styles.title, marginBottom: 16 }}>Inspector</div>
          <div style={styles.empty}>Click a node to inspect it.</div>
        </div>
      );
    }

    const src = RUN_SOURCE_CONFIG[run.runSource];
    const isLocal = run.runSource === "local-nextflow";
    const workflowName = WORKFLOW_DISPLAY[run.workflowTemplateId] ?? run.workflowTemplateId;

    const runRows: [string, React.ReactNode][] = [
      ["Name",    run.name],
      ["Status",  <span style={{ color: RUN_STATUS_COLOUR[run.status] }}>{run.status}</span>],
      ["Started", new Date(run.startedAt).toLocaleString()],
      ...(run.completedAt ? [["Completed", new Date(run.completedAt).toLocaleString()] as [string, React.ReactNode]] : []),
    ];

    if (isLocal) {
      runRows.push(["Run ID",   <span style={{ fontFamily: "monospace", fontSize: 11 }}>{run.id}</span>]);
      runRows.push(["Workflow", workflowName]);
      runRows.push(["DAG",      run.dagAvailable  ? "✓" : "✗"]);
      runRows.push(["Trace",    run.traceAvailable ? "✓" : "✗"]);
    }

    return (
      <div style={styles.panel}>
        <div style={{ ...styles.title, marginBottom: 16 }}>Run Info</div>
        <span style={{
          display: "inline-block",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: src.color,
          border: `1px solid ${src.color}50`,
          background: `${src.color}18`,
          borderRadius: 3,
          padding: "1px 6px",
          marginBottom: 16,
        }}>
          {src.label}
        </span>
        {runRows.map(([k, v]) => (
          <div key={String(k)} style={styles.row}>
            <span style={styles.key}>{k}</span>
            <span style={styles.value}>{v}</span>
          </div>
        ))}
        {isLocal && onOpenSummary && (
          <>
            <div style={styles.sectionLabel}>Artefacts</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                style={styles.fileBtn}
                onClick={() => onOpenSummary({ type: "report", runId: run.id })}
              >
                Report
              </button>
              <button
                style={styles.fileBtn}
                onClick={() => onOpenSummary({ type: "timeline", runId: run.id })}
              >
                Timeline
              </button>
            </div>
          </>
        )}
        {run.nodes.length > 0 && (
          <div style={{ ...styles.empty, marginTop: 8 }}>Click a node to inspect it.</div>
        )}
      </div>
    );
  }

  const colour = STATUS_COLOUR[node.status ?? "UNKNOWN"];

  const basicRows: Row[] = [
    ["Process",   node.processName],
    ["Status",    node.status],
    ["Exit code", node.exitCode],
    ["Duration",  node.duration],
    ["CPUs",      node.cpus],
    ["Memory",    node.memory],
  ];

  const traceRows: Row[] = [
    ["Realtime",  node.realtime],
    ["CPU",       node.cpu_pct],
    ["Peak RSS",  node.peak_rss],
    ["Peak VMem", node.peak_vmem],
    ["Read",      node.rchar],
    ["Written",   node.wchar],
    ["Submit",    node.submit],
    ["Hash",      node.hash],
    ["Task ID",   node.task_id],
    ["Native ID", node.native_id],
  ];

  const visibleTrace = traceRows.filter(([, v]) => v !== undefined && v !== null);

  const renderRow = ([k, v]: Row) => (
    <div key={k} style={styles.row}>
      <span style={styles.key}>{k}</span>
      <span style={styles.value}>{String(v)}</span>
    </div>
  );

  const fileButtons = [
    { label: "Command", path: node.commandPath },
    { label: "Stdout",  path: node.stdoutPath },
    { label: "Stderr",  path: node.stderrPath },
  ].filter((b): b is { label: string; path: string } => !!b.path);

  const hasPathSection = node.workDir || fileButtons.length > 0;

  return (
    <div style={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={styles.title}>{node.label}</div>
        {onDeselect && (
          <button
            style={styles.deselectBtn}
            onClick={onDeselect}
            onMouseEnter={() => setDeselectHover(true)}
            onMouseLeave={() => setDeselectHover(false)}
            title="Deselect node"
          >✕</button>
        )}
      </div>

      {node.status && (
        <span style={{ ...styles.badge, background: colour }}>{node.status}</span>
      )}

      {onOpenSummary && node.status && (
        <button
          style={styles.summaryBtn}
          onClick={() => onOpenSummary({ type: "debug-summary", nodeId: node.id })}
        >
          Summary
        </button>
      )}

      {basicRows.filter(([, v]) => v !== undefined && v !== null).map(renderRow)}

      {visibleTrace.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Trace</div>
          {visibleTrace.map(renderRow)}
        </>
      )}

      {hasPathSection && (
        <>
          <div style={styles.sectionLabel}>Paths</div>
          {node.workDir && (
            <div style={styles.row}>
              <span style={styles.key}>Work dir</span>
              <span style={styles.value}>{node.workDir}</span>
            </div>
          )}
          {fileButtons.map(({ label, path }) => (
            <div key={label} style={styles.row}>
              <span style={styles.key}>{label}</span>
              <button
                style={styles.fileBtn}
                onClick={() => onOpenSummary?.({ type: "file", label, path })}
              >
                View
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
