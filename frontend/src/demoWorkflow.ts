import { Dispatch, SetStateAction } from "react";
import { WorkflowGraph, WorkflowNode, WorkflowRun } from "./types";

export const DEMO_NODES: WorkflowNode[] = [
  { id: "fastqc",    label: "FASTQC",              processName: "FASTQC",              status: "UNKNOWN" },
  { id: "trim",      label: "TRIM_GALORE",          processName: "TRIM_GALORE",         status: "UNKNOWN" },
  { id: "align",     label: "STAR_ALIGN",           processName: "STAR_ALIGN",          status: "UNKNOWN" },
  { id: "sort",      label: "SAMTOOLS_SORT",        processName: "SAMTOOLS_SORT",       status: "UNKNOWN" },
  { id: "index",     label: "SAMTOOLS_INDEX",       processName: "SAMTOOLS_INDEX",      status: "UNKNOWN" },
  { id: "haplotype", label: "GATK_HAPLOTYPECALLER", processName: "GATK_HAPLOTYPECALLER", status: "UNKNOWN" },
  { id: "multiqc",   label: "MULTIQC",              processName: "MULTIQC",             status: "UNKNOWN" },
];

export const DEMO_EDGES: WorkflowGraph["edges"] = [
  { source: "fastqc",  target: "trim"      },
  { source: "trim",    target: "align"     },
  { source: "align",   target: "sort"      },
  { source: "sort",    target: "index"     },
  { source: "sort",    target: "haplotype" },
  { source: "fastqc",  target: "multiqc"   },
  { source: "trim",    target: "multiqc"   },
];

type NodeUpdate = { id: string; status: WorkflowNode["status"] };

const STEPS: NodeUpdate[][] = [
  [{ id: "fastqc",    status: "RUNNING"   }],
  [{ id: "fastqc",    status: "COMPLETED" }, { id: "trim",      status: "RUNNING"   }],
  [{ id: "trim",      status: "COMPLETED" }, { id: "align",     status: "RUNNING"   }, { id: "multiqc",   status: "RUNNING"   }],
  [{ id: "align",     status: "COMPLETED" }, { id: "multiqc",   status: "COMPLETED" }, { id: "sort",      status: "RUNNING"   }],
  [{ id: "sort",      status: "COMPLETED" }, { id: "index",     status: "RUNNING"   }, { id: "haplotype", status: "RUNNING"   }],
  [{ id: "index",     status: "COMPLETED" }, { id: "haplotype", status: "FAILED"    }],
];

export function getInitialDemoGraph(): WorkflowGraph {
  return {
    nodes: DEMO_NODES.map((n) => ({ ...n })),
    edges: DEMO_EDGES,
  };
}

// Updates only the run identified by runId; leaves all other runs untouched.
export function runDemoSimulation(
  setRuns: Dispatch<SetStateAction<WorkflowRun[]>>,
  runId: string,
  onDone: () => void,
): () => void {
  let step = 0;
  const timer = setInterval(() => {
    if (step >= STEPS.length) {
      clearInterval(timer);
      onDone();
      return;
    }
    const updates = new Map(STEPS[step].map((u) => [u.id, u.status]));
    step++;
    setRuns((prev) =>
      prev.map((run) => {
        if (run.id !== runId) return run;
        return {
          ...run,
          nodes: run.nodes.map((n) =>
            updates.has(n.id) ? { ...n, status: updates.get(n.id) } : n,
          ),
        };
      }),
    );
  }, 1500);
  return () => clearInterval(timer);
}
