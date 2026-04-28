export type Status = "COMPLETED" | "FAILED" | "CACHED" | "SKIPPED" | "UNKNOWN";

export type WorkflowNode = {
  id: string;
  label: string;
  processName?: string;
  status?: Status;
  workDir?: string;
  exitCode?: number;
  duration?: string;
  cpus?: number;
  memory?: string;
};

export type WorkflowEdge = {
  source: string;
  target: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
