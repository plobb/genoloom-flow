export type Status = "COMPLETED" | "FAILED" | "CACHED" | "SKIPPED" | "UNKNOWN" | "RUNNING";

export type ErrorGroup = {
  signature: string;
  title: string;
  count: number;
  exampleMessage: string;
  representativeHash?: string;
  representativeStderrPath?: string;
  sampleLabels: string[];
};

export type TaskRecord = {
  task_id?:     string;
  hash?:        string;
  native_id?:   string;
  sampleLabel?: string;
  status?:      Status;
  exitCode?:    number;
  duration?:    string;
  workDir?:     string;
  commandPath?: string;
  stdoutPath?:  string;
  stderrPath?:  string;
};

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
  // Per-task records for drilldown (populated for aggregated process nodes)
  tasks?: TaskRecord[];
  // Grouped failure signatures (only present when trace + work_base available)
  errorGroups?: ErrorGroup[];
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
  source?: string;
  archived?: boolean;
  // Derived summary metadata (absent for older runs or dag-only imports)
  task_count?: number;
  failed_task_count?: number;
  completed_task_count?: number;
  failed_process_count?: number;
  top_error_title?: string;
  top_error_count?: number;
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

export type RunSource = "sample" | "simulated" | "upload" | "local-nextflow" | "imported";

export function isLocalRun(source: RunSource): boolean {
  return source === "local-nextflow" || source === "imported";
}

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
  archived?: boolean;
  // Only populated for local-nextflow runs
  dagAvailable?: boolean;
  traceAvailable?: boolean;
  reportAvailable?: boolean;
  timelineAvailable?: boolean;
};
