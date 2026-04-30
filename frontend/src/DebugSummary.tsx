import { WorkflowNode } from "./types";

const NEXT_CHECKS = [
  "Review .command.err for error output",
  "Review .command.sh to verify the executed command",
  "Confirm input files exist and are readable",
  "Confirm the container or tool is available on this system",
  "Check memory/CPU limits if the error is resource-related",
];

type Props = {
  node: WorkflowNode | null;
};

export default function DebugSummary({ node }: Props) {
  const visible =
    node !== null &&
    (node.status === "FAILED" || !!node.stderrPath || !!node.commandPath);

  if (!visible) return null;

  const row = (label: string, value: string | number | undefined | null) =>
    value !== undefined && value !== null ? (
      <div key={label} style={styles.row}>
        <span style={styles.key}>{label}</span>
        <span style={styles.value}>{String(value)}</span>
      </div>
    ) : null;

  return (
    <div style={styles.panel}>
      <div style={styles.heading}>Debug Summary</div>

      <div style={styles.section}>
        {row("Process", node!.label)}
        {row("Status", node!.status)}
        {row("Exit code", node!.exitCode)}
        {row("Duration", node!.duration)}
        {row("Command", node!.commandPath)}
        {row("Stderr", node!.stderrPath)}
      </div>

      <div style={styles.sectionLabel}>Next checks</div>
      <ul style={styles.checklist}>
        {NEXT_CHECKS.map((c) => (
          <li key={c} style={styles.checkItem}>{c}</li>
        ))}
      </ul>

      <div style={styles.aiRow}>
        <button style={styles.aiBtn} disabled title="AI interpretation is not yet available">
          Interpret with AI
        </button>
        <span style={styles.aiHint}>Coming later</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 420,
    minWidth: 420,
    background: "#161923",
    borderLeft: "1px solid #2d3148",
    padding: "20px 20px 24px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  heading: {
    fontSize: 13,
    fontWeight: 600,
    color: "#94a3b8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  section: {
    marginBottom: 16,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "5px 0",
    borderBottom: "1px solid #1e2130",
    fontSize: 12,
    gap: 12,
  },
  key: {
    color: "#64748b",
    flexShrink: 0,
    paddingTop: 1,
  },
  value: {
    color: "#cbd5e1",
    textAlign: "right",
    wordBreak: "break-all",
    fontFamily: "'Fira Mono', 'Cascadia Code', 'Menlo', monospace",
    fontSize: 11,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  checklist: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 20,
  },
  checkItem: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 1.5,
  },
  aiRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: "auto",
    paddingTop: 16,
    borderTop: "1px solid #2d3148",
  },
  aiBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid #3d4468",
    background: "#2d3148",
    color: "#475569",
    cursor: "not-allowed",
    opacity: 0.6,
  },
  aiHint: {
    fontSize: 11,
    color: "#475569",
    fontStyle: "italic",
  },
};
