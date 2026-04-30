import { useState, useEffect } from "react";
import { WorkflowNode } from "./types";

const API = "http://localhost:8000";

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
  const [fileLabel, setFileLabel]     = useState<string | null>(null);
  const [filePath, setFilePath]       = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError]     = useState<string | null>(null);
  const [wordWrap, setWordWrap]       = useState(false);
  const [copied, setCopied]           = useState(false);

  // Clear viewer on node change; auto-load stderr for FAILED nodes
  useEffect(() => {
    setFileLabel(null);
    setFilePath(null);
    setFileContent(null);
    setFileError(null);
    setFileLoading(false);
    setCopied(false);

    if (node?.status === "FAILED" && node.stderrPath) {
      const path = node.stderrPath;
      setFileLabel("Stderr");
      setFilePath(path);
      setFileLoading(true);
      fetch(`${API}/api/file?path=${encodeURIComponent(path)}`)
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => null);
            throw new Error(body?.detail ?? `HTTP ${r.status}`);
          }
          return r.text();
        })
        .then((text) => setFileContent(text))
        .catch((e) => setFileError(String(e)))
        .finally(() => setFileLoading(false));
    }
  }, [node?.id]);

  async function loadFile(label: string, path: string) {
    setFileLabel(label);
    setFilePath(path);
    setFileContent(null);
    setFileError(null);
    setFileLoading(true);
    setCopied(false);
    try {
      const r = await fetch(`${API}/api/file?path=${encodeURIComponent(path)}`);
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.detail ?? `HTTP ${r.status}`);
      }
      setFileContent(await r.text());
    } catch (e) {
      setFileError(String(e));
    } finally {
      setFileLoading(false);
    }
  }

  function closeViewer() {
    setFileLabel(null);
    setFilePath(null);
    setFileContent(null);
    setFileError(null);
    setCopied(false);
  }

  async function copyToClipboard() {
    if (!fileContent) return;
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const fileName   = filePath ? (filePath.split("/").pop() ?? filePath) : fileLabel;
  const syntaxHint = filePath?.endsWith(".sh") ? "bash" : "text";

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
    title: { fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" },
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
    fileBtnActive: {
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 4,
      border: "1px solid #4f46e5",
      background: "#2d3148",
      color: "#818cf8",
      cursor: "pointer",
      flexShrink: 0,
    },
    // ---- file viewer ----
    viewer: {
      marginTop: 16,
      borderTop: "1px solid #2d3148",
      paddingTop: 10,
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
    },
    viewerTitleRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 6,
    },
    viewerTitle: {
      fontSize: 12,
      fontWeight: 600,
      color: "#e2e8f0",
      fontFamily: "monospace",
    },
    closeBtn: {
      fontSize: 12,
      background: "none",
      border: "none",
      color: "#475569",
      cursor: "pointer",
      padding: 0,
      lineHeight: 1,
      flexShrink: 0,
    },
    toolbar: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    syntaxBadge: {
      fontSize: 10,
      padding: "1px 6px",
      borderRadius: 3,
      background: "#0f1117",
      color: "#64748b",
      border: "1px solid #2d3148",
      fontFamily: "monospace",
      letterSpacing: 0.3,
    },
    toolBtn: {
      fontSize: 11,
      padding: "1px 7px",
      borderRadius: 4,
      border: "1px solid #3d4468",
      background: "#2d3148",
      color: "#94a3b8",
      cursor: "pointer",
    },
    statusMsg: { fontSize: 12, color: "#64748b", padding: "4px 0" },
    errorMsg:  { fontSize: 12, color: "#f87171", padding: "4px 0" },
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

  const preStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 11,
    fontFamily: "'Fira Mono', 'Cascadia Code', 'Menlo', monospace",
    color: "#cbd5e1",
    background: "#0a0c12",
    padding: "8px 10px 24px",
    borderRadius: 4,
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: 420,
    minHeight: 180,
    whiteSpace: wordWrap ? "pre-wrap" : "pre",
    wordBreak: wordWrap ? "break-all" : "normal",
    flex: 1,
  };

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
                style={fileLabel === label ? styles.fileBtnActive : styles.fileBtn}
                onClick={() => loadFile(label, path)}
              >
                {fileLabel === label && fileLoading ? "Loading…" : "View"}
              </button>
            </div>
          ))}
        </>
      )}

      {fileLabel && (
        <div style={styles.viewer}>
          {/* Title row */}
          <div style={styles.viewerTitleRow}>
            <span style={styles.viewerTitle}>Viewing: {fileName}</span>
            <button style={styles.closeBtn} onClick={closeViewer}>✕</button>
          </div>

          {/* Toolbar — only shown when content is ready */}
          {fileContent !== null && (
            <div style={styles.toolbar}>
              <span style={styles.syntaxBadge}>{syntaxHint}</span>
              <button
                style={{
                  ...styles.toolBtn,
                  ...(wordWrap ? { borderColor: "#4f46e5", color: "#818cf8" } : {}),
                }}
                onClick={() => setWordWrap((w) => !w)}
                title="Toggle line wrapping"
              >
                {wordWrap ? "Wrap: on" : "Wrap: off"}
              </button>
              <button
                style={{
                  ...styles.toolBtn,
                  ...(copied ? { borderColor: "#22c55e", color: "#22c55e" } : {}),
                }}
                onClick={copyToClipboard}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}

          {fileLoading && <div style={styles.statusMsg}>Loading…</div>}
          {fileError   && <div style={styles.errorMsg}>{fileError}</div>}
          {fileContent !== null && <pre style={preStyle}>{fileContent}</pre>}
        </div>
      )}
    </div>
  );
}
