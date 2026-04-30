from typing import List, Optional, Literal
from pydantic import BaseModel

Status = Literal["COMPLETED", "FAILED", "CACHED", "SKIPPED", "UNKNOWN"]


class WorkflowNode(BaseModel):
    id: str
    label: str
    processName: Optional[str] = None
    status: Optional[Status] = None
    workDir: Optional[str] = None
    commandPath: Optional[str] = None
    stdoutPath: Optional[str] = None
    stderrPath: Optional[str] = None
    exitCode: Optional[int] = None
    duration: Optional[str] = None
    cpus: Optional[int] = None
    memory: Optional[str] = None
    # Trace fields
    hash: Optional[str] = None
    task_id: Optional[str] = None
    native_id: Optional[str] = None
    submit: Optional[str] = None
    realtime: Optional[str] = None
    cpu_pct: Optional[str] = None
    peak_rss: Optional[str] = None
    peak_vmem: Optional[str] = None
    rchar: Optional[str] = None
    wchar: Optional[str] = None


class WorkflowEdge(BaseModel):
    source: str
    target: str


class WorkflowGraph(BaseModel):
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
