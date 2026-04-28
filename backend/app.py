from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import WorkflowGraph, WorkflowNode, WorkflowEdge

app = FastAPI(title="Nexflow Debugger")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

PLACEHOLDER_GRAPH = WorkflowGraph(
    nodes=[
        WorkflowNode(id="1", label="FASTQC", processName="FASTQC", status="COMPLETED", duration="1m 2s", cpus=2, memory="4 GB"),
        WorkflowNode(id="2", label="TRIMGALORE", processName="TRIMGALORE", status="COMPLETED", duration="3m 14s", cpus=4, memory="8 GB"),
        WorkflowNode(id="3", label="ALIGN", processName="ALIGN", status="FAILED", exitCode=1, duration="12m 5s", cpus=8, memory="32 GB"),
        WorkflowNode(id="4", label="SORT", processName="SORT", status="UNKNOWN"),
    ],
    edges=[
        WorkflowEdge(source="1", target="2"),
        WorkflowEdge(source="2", target="3"),
        WorkflowEdge(source="3", target="4"),
    ],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph", response_model=WorkflowGraph)
def graph():
    return PLACEHOLDER_GRAPH
