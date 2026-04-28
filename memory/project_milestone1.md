---
name: Nexflow Debugger milestone 1 scaffold
description: First milestone scaffold completed — backend FastAPI + frontend Vite/React/D3 with placeholder graph
type: project
---

Milestone 1 scaffold is complete. The repo has:

- `backend/app.py` — FastAPI with `/health` and `/graph` (returns placeholder 4-node graph)
- `backend/models.py` — Pydantic WorkflowNode / WorkflowEdge / WorkflowGraph
- `backend/parsers/dag_parser.py` and `trace_parser.py` — stubs only, raise NotImplementedError
- `frontend/` — Vite + React + TypeScript, D3 force-directed graph, NodeInspector side panel

**Why:** Milestone 1 is scaffold only — no real Nextflow parsing yet.

**How to apply:** Next step is milestone 2: wire up real dag.dot and trace.txt parsing in the backend parsers.
