export type Status = "COMPLETED" | "FAILED" | "CACHED" | "SKIPPED" | "UNKNOWN";

export type WorkflowNode = {
  id: string;
  label: string;
  processName?: string;
  status?: Status;
  workDir?: string;
  commandPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
  exitCode?: number;
  duration?: string;
  cpus?: number;
  memory?: string;
  // Trace fields
  hash?: string;
  task_id?: string;
  native_id?: string;
  submit?: string;
  realtime?: string;
  cpu_pct?: string;
  peak_rss?: string;
  peak_vmem?: string;
  rchar?: string;
  wchar?: string;
};

export type WorkflowEdge = {
  source: string;
  target: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type RunSummary = {
  run_id: string;
  run_dir: string;
  artefacts: {
    dag: boolean;
    trace: boolean;
    report: boolean;
    timeline: boolean;
    stdout: boolean;
    stderr: boolean;
  };
};
