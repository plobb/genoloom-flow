export type Status = "COMPLETED" | "FAILED" | "CACHED" | "SKIPPED" | "UNKNOWN" | "RUNNING";

export type WorkflowNode = {
  id: string;
  label: string;
  processName?: string;
  status?: Status;
  workDir?: string;
  commandPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
  commandContent?: string;
  stdoutContent?: string;
  stderrContent?: string;
  exitCode?: number;
  duration?: string;
  cpus?: number;
  memory?: string;
  // Process-view aggregate fields (only present on derived process nodes)
  taskCount?: number;
  completedCount?: number;
  failedCount?: number;
  runningCount?: number;
  unknownCount?: number;
  childNodeIds?: string[];
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
  display_name?: string;
  name?: string;
  status?: string;
  artefacts: {
    dag: boolean;
    trace: boolean;
    report: boolean;
    timeline: boolean;
    stdout: boolean;
    stderr: boolean;
  };
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  source: "local" | "nf-core" | "github";
  repo?: string;
  version?: string;
  description?: string;
};

export type RunSource = "sample" | "simulated" | "upload" | "local-nextflow";

export type SummaryPane =
  | { type: "debug-summary"; nodeId: string }
  | { type: "report"; runId: string }
  | { type: "timeline"; runId: string }
  | { type: "file"; label: string; path: string; content?: string }
  | { type: "task-list"; processLabel: string; tasks: WorkflowNode[] };

export type WorkflowRun = {
  id: string;
  workflowTemplateId: string;
  name: string;
  runSource: RunSource;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startedAt: string;
  completedAt?: string;
  // Only populated for local-nextflow runs
  dagAvailable?: boolean;
  traceAvailable?: boolean;
  reportAvailable?: boolean;
  timelineAvailable?: boolean;
};
