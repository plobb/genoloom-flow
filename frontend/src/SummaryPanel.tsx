import { useState, useEffect } from "react";
import { WorkflowNode, WorkflowRun, SummaryPane } from "./types";

const API = "http://localhost:8000";

const NEXT_CHECKS = [
  "Review .command.err for error output",
  "Review .command.sh to verify the executed command",
  "Confirm input files exist and are readable",
  "Confirm the container or tool is available on this system",
  "Check memory/CPU limits if the error is resource-related",
];

type Props = {
  pane: SummaryPane;
  onClose: () => void;
  node: WorkflowNode | null;
  run: WorkflowRun | null;
};

export default function SummaryPanel({ pane, onClose, node, run }: Props) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError]     = useState<string | null>(null);
  const [wordWrap, setWordWrap]       = useState(false);
  const [copied, setCopied]           = useState(false);
  const [closeHover, setCloseHover]   = useState(false);

  const filePath = pane.type === "file" ? pane.path : null;

  useEffect(() => {
    setFileContent(null);
    setFileError(null);
    setWordWrap(false);
    setCopied(false);
    if (!filePath) return;
    setFileLoading(true);
    fetch(`${API}/api/file?path=${encodeURIComponent(filePath)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.detail ?? `HTTP ${r.status}`);
        }
        return r.text();
      })
      .then(setFileContent)
      .catch((e) => setFileError(String(e)))
      .finally(() => setFileLoading(false));
  }, [filePath]);

  async function copyToClipboard() {
    if (!fileContent) return;
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const title = (() => {
    switch (pane.type) {
      case "debug-summary": return `Debug Summary — ${node?.label ?? ""}`;
      case "report":        return `Report — ${run?.name ?? pane.runId}`;
      case "timeline":      return `Timeline — ${run?.name ?? pane.runId}`;
      case "file":          return pane.label;
    }
  })();

  const iframeUrl =
    pane.type === "report"   ? `${API}/api/runs/${pane.runId}/report`   :
    pane.type === "timeline" ? `${API}/api/runs/${pane.runId}/timeline` :
    null;

  const syntaxHint = pane.type === "file" && pane.path.endsWith(".sh") ? "bash" : "text";

  const closeBtn: React.CSSProperties = {
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "1px solid #3d4468",
    background: closeHover ? "#3d4468" : "#2d3148",
    color: closeHover ? "#e2e8f0" : "#64748b",
    cursor: "pointer",
    padding: 0,
    fontSize: 13,
    lineHeight: 1,
    flexShrink: 0,
    transition: "background 0.1s, color 0.1s",
  };

  const row = (label: string, value: string | number | undefined | null) =>
    value !== undefined && value !== null ? (
      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #1e2130", fontSize: 12, gap: 12 }}>
        <span style={{ color: "#64748b", flexShrink: 0, paddingTop: 1 }}>{label}</span>
        <span style={{ color: "#cbd5e1", textAlign: "right", wordBreak: "break-all", fontFamily: "'Fira Mono', 'Cascadia Code', 'Menlo', monospace", fontSize: 11 }}>{String(value)}</span>
      </div>
    ) : null;

  function renderBody() {
    if (pane.type === "debug-summary" && node) {
      return (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: 16 }}>
            {row("Process",   node.label)}
            {row("Status",    node.status)}
            {row("Exit code", node.exitCode)}
            {row("Duration",  node.duration)}
            {row("Hash",      node.hash)}
            {row("Command",   node.commandPath)}
            {row("Stderr",    node.stderrPath)}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "#475569", textTransform: "uppercase", marginBottom: 8 }}>
            Next checks
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {NEXT_CHECKS.map((c) => (
              <li key={c} style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{c}</li>
            ))}
          </ul>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto", paddingTop: 16, borderTop: "1px solid #2d3148" }}>
            <button
              disabled
              title="AI interpretation is not yet available"
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "1px solid #3d4468", background: "#2d3148", color: "#475569", cursor: "not-allowed", opacity: 0.6 }}
            >
              Interpret with AI
            </button>
            <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>Coming later</span>
          </div>
        </div>
      );
    }

    if (iframeUrl) {
      return (
        <iframe
          src={iframeUrl}
          style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
          title={title}
        />
      );
    }

    if (pane.type === "file") {
      return (
        <div style={{ flex: 1, overflow: "hidden", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {fileLoading && <div style={{ fontSize: 12, color: "#64748b" }}>Loading…</div>}
          {fileError   && <div style={{ fontSize: 12, color: "#f87171" }}>{fileError}</div>}
          {fileContent !== null && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#0f1117", color: "#64748b", border: "1px solid #2d3148", fontFamily: "monospace", letterSpacing: 0.3 }}>
                  {syntaxHint}
                </span>
                <button
                  style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, border: "1px solid #3d4468", background: "#2d3148", color: wordWrap ? "#818cf8" : "#94a3b8", cursor: "pointer", ...(wordWrap ? { borderColor: "#4f46e5" } : {}) }}
                  onClick={() => setWordWrap((w) => !w)}
                  title="Toggle line wrapping"
                >
                  {wordWrap ? "Wrap: on" : "Wrap: off"}
                </button>
                <button
                  style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, border: "1px solid #3d4468", background: "#2d3148", color: copied ? "#22c55e" : "#94a3b8", cursor: "pointer", ...(copied ? { borderColor: "#22c55e" } : {}) }}
                  onClick={copyToClipboard}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre style={{
                margin: 0,
                flex: 1,
                fontSize: 11,
                fontFamily: "'Fira Mono', 'Cascadia Code', 'Menlo', monospace",
                color: "#cbd5e1",
                background: "#0a0c12",
                padding: "8px 10px",
                borderRadius: 4,
                overflowX: "auto",
                overflowY: "auto",
                whiteSpace: wordWrap ? "pre-wrap" : "pre",
                wordBreak: wordWrap ? "break-all" : "normal",
              }}>{fileContent}</pre>
            </>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{ width: 500, minWidth: 500, background: "#161923", borderLeft: "1px solid #2d3148", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #2d3148", flexShrink: 0, gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {iframeUrl && (
            <a
              href={iframeUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, border: "1px solid #3d4468", background: "#2d3148", color: "#94a3b8", textDecoration: "none" }}
            >
              Open in tab ↗
            </a>
          )}
          <button
            style={closeBtn}
            onClick={onClose}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            title="Close panel"
          >✕</button>
        </div>
      </div>
      {renderBody()}
    </div>
  );
}
