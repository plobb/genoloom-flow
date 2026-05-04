import { useState, useEffect } from "react";
import { WorkflowNode, WorkflowRun, SummaryPane } from "./types";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type FailureExplanation = {
  summary: string;
  likelyCauseHeadline: string;
  likelyCauseDetail: string;
  whatToCheck: string[];
  evidenceLabels: string[];
};

function detectErrorPattern(stderr: string | undefined) {
  if (!stderr) return null;

  const lower = stderr.toLowerCase();

  if (lower.includes("no such file") || lower.includes("file not found")) {
    return {
      headline: "Missing input file",
      explanation: "The process failed because an expected input file could not be found.",
      checks: [
        "Check that input file paths are correct",
        "Verify upstream process outputs",
        "Ensure files are not being cleaned or moved prematurely",
      ],
      evidence: ["'No such file' found in stderr"],
    };
  }

  if (lower.includes("permission denied")) {
    return {
      headline: "Permission error",
      explanation: "The process does not have permission to access a required file or directory.",
      checks: [
        "Check file permissions",
        "Verify container/user execution context",
        "Ensure working directory is writable",
      ],
      evidence: ["'Permission denied' found in stderr"],
    };
  }

  if (
    lower.includes("java.lang.outofmemoryerror") ||
    lower.includes("gc overhead limit exceeded") ||
    lower.includes("unable to allocate")
  ) {
    return {
      headline: "Java memory error",
      explanation: "The process appears to have run out of Java heap or available memory.",
      checks: [
        "Increase the process memory setting",
        "Check Java heap options such as -Xmx",
        "Review whether the input size is larger than expected",
      ],
      evidence: ["Memory error found in stderr"],
    };
  }

  if (
    lower.includes("command not found") ||
    lower.includes("not found") ||
    lower.includes("exit status 127")
  ) {
    return {
      headline: "Command not found",
      explanation: "The process tried to run a command that was not available in the execution environment.",
      checks: [
        "Check the process container image",
        "Confirm the tool is installed and on PATH",
        "Verify the command name and spelling",
      ],
      evidence: ["Command lookup failure found in stderr"],
    };
  }

  if (
    lower.includes("failed to pull image") ||
    lower.includes("manifest unknown") ||
    lower.includes("singularity") ||
    lower.includes("apptainer") ||
    lower.includes("docker: error response from daemon")
  ) {
    return {
      headline: "Container image problem",
      explanation: "The process appears to have failed while preparing or using its container image.",
      checks: [
        "Check the container image name and tag",
        "Verify registry access from the execution environment",
        "Confirm Docker, Singularity, or Apptainer is configured correctly",
      ],
      evidence: ["Container-related error found in stderr"],
    };
  }

  return null;
}

function getFailureExplanation(node: WorkflowNode): FailureExplanation {
  if (node.commandPath === "__demo__" && node.processName === "GATK_HAPLOTYPECALLER") {
    return {
      summary: "GATK_HAPLOTYPECALLER failed (exit code 1)",
      likelyCauseHeadline: "Missing reference dictionary (.dict file)",
      likelyCauseDetail:
        "GATK requires both a .fai index and a .dict file alongside the reference FASTA — /ref/hg38.fa.dict was not found.",
      whatToCheck: [
        "Run: gatk CreateSequenceDictionary -R /ref/hg38.fa",
        "Confirm /ref/hg38.fa.fai is present (samtools faidx /ref/hg38.fa)",
        "Verify the reference path is correct and mounted inside the container",
      ],
      evidenceLabels: ["Stderr", "Command"],
    };
  }

  const pattern = detectErrorPattern(node.stderrContent);
  if (pattern) {
    return {
      summary:
        node.exitCode !== undefined && node.exitCode !== null
          ? `Process exited with status ${node.exitCode}.`
          : "Process failed.",
      likelyCauseHeadline: pattern.headline,
      likelyCauseDetail: pattern.explanation,
      whatToCheck: pattern.checks,
      evidenceLabels: ["Stderr"],
    };
  }

  return {
    summary:
      node.exitCode !== undefined && node.exitCode !== null
        ? `Process exited with status ${node.exitCode}.`
        : "Process failed.",
    likelyCauseHeadline: "Unknown",
    likelyCauseDetail: "Inspect the error output and command for details.",
    whatToCheck: [
      "Review .command.err for error messages",
      "Review .command.sh to verify the executed command",
      "Confirm input files exist and are readable",
      "Confirm the tool or container image is available",
      "Check memory/CPU limits if this looks resource-related",
    ],
    evidenceLabels: [],
  };
}

const STATUS_COLOUR: Record<string, string> = {
  COMPLETED: "#22c55e", FAILED: "#ef4444", CACHED: "#3b82f6",
  SKIPPED: "#9ca3af", UNKNOWN: "#9ca3af", RUNNING: "#f59e0b",
};

type Props = {
  pane: SummaryPane;
  onClose: () => void;
  node: WorkflowNode | null;
  run: WorkflowRun | null;
  onOpenPane?: (pane: SummaryPane) => void;
  onSelectTask?: (taskId: string) => void;
  onHoverTask?: (taskId: string | null) => void;
};

export default function SummaryPanel({ pane, onClose, node, run, onOpenPane, onSelectTask, onHoverTask }: Props) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError]     = useState<string | null>(null);
  const [wordWrap, setWordWrap]       = useState(false);
  const [copied, setCopied]           = useState(false);
  const [closeHover, setCloseHover]   = useState(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  const filePath    = pane.type === "file" ? pane.path    : null;
  const fileInline  = pane.type === "file" ? pane.content : null;

  useEffect(() => {
    setFileContent(null);
    setFileError(null);
    setWordWrap(false);
    setCopied(false);
    if (!filePath) return;
    if (fileInline) {
      setFileContent(fileInline);
      return;
    }
    if (filePath === "__demo__") return;
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
  }, [filePath, fileInline]);

  async function copyToClipboard() {
    if (!fileContent) return;
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const title = (() => {
    switch (pane.type) {
      case "debug-summary": return `Debug summary — ${node?.label ?? ""}`;
      case "report":        return `Report — ${run?.name ?? pane.runId}`;
      case "timeline":      return `Timeline — ${run?.name ?? pane.runId}`;
      case "file":          return `${pane.label} — ${node?.label ?? ""}`;
      case "task-list":     return `Tasks — ${pane.processLabel}`;
    }
  })();

  const iframeUrl =
    pane.type === "report"   ? `${API}/api/runs/${pane.runId}/report`   :
    pane.type === "timeline" ? `${API}/api/runs/${pane.runId}/timeline` :
    null;

  const syntaxHint = pane.type === "file" && pane.path.endsWith(".sh") ? "bash" : "text";

  const taskCountSuffix = pane.type === "task-list" ? (() => {
    const { tasks } = pane;
    const failed    = tasks.filter((t) => t.status === "FAILED").length;
    const running   = tasks.filter((t) => t.status === "RUNNING").length;
    const completed = tasks.filter((t) => t.status === "COMPLETED" || t.status === "CACHED").length;
    const unknown   = tasks.length - failed - running - completed;
    const parts = [`${tasks.length} total`];
    if (failed > 0)    parts.push(`${failed} failed`);
    if (running > 0)   parts.push(`${running} running`);
    if (completed > 0) parts.push(`${completed} completed`);
    if (unknown > 0)   parts.push(`${unknown} unknown`);
    return `(${parts.join(" • ")})`;
  })() : null;

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
          {node.status === "FAILED" ? (() => {
            // For process-aggregate nodes, resolve the failed child task so
            // getFailureExplanation can match demo content fields (commandPath etc.)
            const taskNode: WorkflowNode = (() => {
              if (node.childNodeIds && run?.nodes) {
                const failed = node.childNodeIds
                  .map((id) => run!.nodes.find((n) => n.id === id))
                  .find((n): n is WorkflowNode => !!n && n.status === "FAILED");
                if (failed) return failed;
              }
              return node;
            })();
            const expl = getFailureExplanation(taskNode);
            const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "#475569", textTransform: "uppercase", marginBottom: 6, marginTop: 14 };
            const evidenceArtefacts = [
              { label: "Command", path: taskNode.commandPath, content: taskNode.commandContent },
              { label: "Stdout",  path: taskNode.stdoutPath,  content: taskNode.stdoutContent  },
              { label: "Stderr",  path: taskNode.stderrPath,  content: taskNode.stderrContent  },
            ].filter((a): a is { label: string; path: string; content: string | undefined } =>
              !!a.path && expl.evidenceLabels.includes(a.label)
            );
            return (
              <>
                <div style={sectionLabel}>Failure summary</div>
                <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 2 }}>{expl.summary}</div>

                <div style={sectionLabel}>Likely cause</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{expl.likelyCauseHeadline}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 2 }}>{expl.likelyCauseDetail}</div>

                <div style={sectionLabel}>What to check</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5, marginBottom: 2 }}>
                  {expl.whatToCheck.map((c) => (
                    <li key={c} style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{c}</li>
                  ))}
                </ul>

                {evidenceArtefacts.length > 0 && (
                  <>
                    <div style={sectionLabel}>Evidence</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                      {evidenceArtefacts.map(({ label, path, content }) => (
                        <button
                          key={label}
                          style={{ fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px solid #3d4468", background: "#2d3148", color: "#94a3b8", cursor: "pointer" }}
                          onClick={() => onOpenPane?.({ type: "file", label, path, content })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })() : (() => {
            const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "#475569", textTransform: "uppercase", marginBottom: 6, marginTop: 14 };
            const allArtefacts = [
              { label: "Command", path: node.commandPath, content: node.commandContent },
              { label: "Stdout",  path: node.stdoutPath,  content: node.stdoutContent  },
              { label: "Stderr",  path: node.stderrPath,  content: node.stderrContent  },
            ].filter((a): a is { label: string; path: string; content: string | undefined } => !!a.path);
            const taskCountParts: string[] = [];
            if (node.completedCount) taskCountParts.push(`${node.completedCount} completed`);
            if (node.failedCount)    taskCountParts.push(`${node.failedCount} failed`);
            if (node.runningCount)   taskCountParts.push(`${node.runningCount} running`);
            if (node.unknownCount)   taskCountParts.push(`${node.unknownCount} unknown`);
            return (
              <>
                <div style={sectionLabel}>Process summary</div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 2 }}>No failure was detected for this process.</div>
                {node.taskCount !== undefined && taskCountParts.length > 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 2 }}>
                    Tasks: {taskCountParts.join(", ")}
                  </div>
                )}
                {allArtefacts.length > 0 && (
                  <>
                    <div style={sectionLabel}>Artefacts</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                      {allArtefacts.map(({ label, path, content }) => (
                        <button
                          key={label}
                          style={{ fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px solid #3d4468", background: "#2d3148", color: "#94a3b8", cursor: "pointer" }}
                          onClick={() => onOpenPane?.({ type: "file", label, path, content })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })()}
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
        <div style={{ flex: 1, overflow: "hidden", padding: "12px", display: "flex", flexDirection: "column" }}>
          <iframe
            src={iframeUrl}
            style={{
              flex: 1,
              width: "100%",
              border: "1px solid #2d3148",
              borderRadius: 6,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              background: "#fff",
            }}
            title={title}
          />
        </div>
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

    if (pane.type === "task-list") {
      return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {pane.tasks.map((task) => {
            const sc = STATUS_COLOUR[task.status ?? "UNKNOWN"] ?? "#9ca3af";
            const files = [
              { label: "Command", path: task.commandPath },
              { label: "Stdout",  path: task.stdoutPath },
              { label: "Stderr",  path: task.stderrPath },
            ].filter((f): f is { label: string; path: string } => !!f.path);
            const hovered = hoveredTaskId === task.id;
            return (
              <div
                key={task.id}
                style={{
                  background: hovered ? "#161923" : "#0f1117",
                  border: `1px solid ${hovered ? "#3d4468" : "#2d3148"}`,
                  borderRadius: 4,
                  padding: "8px 10px",
                  cursor: onSelectTask ? "pointer" : "default",
                  transition: "background 0.1s, border-color 0.1s",
                }}
                onClick={() => onSelectTask?.(task.id)}
                onMouseEnter={() => { setHoveredTaskId(task.id); onHoverTask?.(task.id); }}
                onMouseLeave={() => { setHoveredTaskId(null); onHoverTask?.(null); }}
              >
                <div style={{ display: "flex", alignItems: "baseline", marginBottom: 4, gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc, flexShrink: 0, alignSelf: "center" }} />
                  <span style={{ fontSize: 12, color: "#e2e8f0", wordBreak: "break-all", flex: 1 }}>{task.label}</span>
                  {task.status && <span style={{ fontSize: 10, fontWeight: 500, color: sc, opacity: 0.85, flexShrink: 0 }}>{task.status}</span>}
                </div>
                {(task.exitCode !== undefined || task.duration || task.hash) && (
                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#64748b", marginBottom: files.length > 0 ? 6 : 0, flexWrap: "wrap" }}>
                    {task.exitCode !== undefined && <span>Exit <span style={{ color: "#94a3b8" }}>{task.exitCode}</span></span>}
                    {task.duration && <span>Duration <span style={{ color: "#94a3b8" }}>{task.duration}</span></span>}
                    {task.hash && <span>Hash <span style={{ color: "#94a3b8", fontFamily: "'Fira Mono', monospace", fontSize: 10 }}>{task.hash}</span></span>}
                  </div>
                )}
                {files.length > 0 && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {files.map(({ label, path }) => (
                      <button
                        key={label}
                        style={{ fontSize: 10, padding: "1px 7px", borderRadius: 3, border: "1px solid #3d4468", background: "#2d3148", color: "#94a3b8", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); onOpenPane?.({ type: "file", label, path }); }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{ width: 500, minWidth: 500, background: "#161923", borderLeft: "1px solid #2d3148", borderRight: "1px solid #2d3148", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #2d3148", flexShrink: 0, gap: 10, position: "sticky", top: 0, zIndex: 1, background: "#161923" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
          {taskCountSuffix && (
            <span style={{ fontSize: 11, fontWeight: 400, color: "#64748b", marginLeft: 6 }}>{taskCountSuffix}</span>
          )}
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
