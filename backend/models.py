from typing import List, Optional, Literal
from pydantic import BaseModel

Status = Literal["COMPLETED", "FAILED", "CACHED", "SKIPPED", "UNKNOWN"]


class WorkflowNode(BaseModel):
    id: str
    label: str
    processName: Optional[str] = None
    status: Optional[Status] = None
    workDir: Optional[str] = None
    exitCode: Optional[int] = None
    duration: Optional[str] = None
    cpus: Optional[int] = None
    memory: Optional[str] = None


class WorkflowEdge(BaseModel):
    source: str
    target: str


class WorkflowGraph(BaseModel):
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
