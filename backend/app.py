import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import WorkflowGraph, WorkflowNode, WorkflowEdge
from parsers.dag_parser import parse_dag

app = FastAPI(title="Nexflow Debugger")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Path to the run directory being inspected (hardcoded for milestone 2A)
_RUN_DIR = os.path.join(
    os.path.dirname(__file__), "..", "sample_runs", "example"
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph", response_model=WorkflowGraph)
def graph():
    dot_path = os.path.join(_RUN_DIR, "dag.dot")

    if not os.path.exists(dot_path):
        raise HTTPException(status_code=404, detail=f"dag.dot not found at {dot_path}")

    parsed = parse_dag(dot_path)

    nodes = [WorkflowNode(id=n["id"], label=n["label"]) for n in parsed["nodes"]]
    edges = [WorkflowEdge(source=e["source"], target=e["target"]) for e in parsed["edges"]]

    return WorkflowGraph(nodes=nodes, edges=edges)
