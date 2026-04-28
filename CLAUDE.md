# CLAUDE.md

## Project

Nexflow Debugger is a local-first developer tool for inspecting and debugging Nextflow pipeline runs.

It reads an existing Nextflow run directory and renders an interactive D3.js graph with task-level metadata.

The initial focus is a local desktop-style developer tool suitable for secure bioinformatics environments where data should not leave the machine or HPC/dev environment.

## Stack

- Backend: Python FastAPI
- Frontend: React + TypeScript
- Graph rendering: D3.js
- No database for v0.1
- No authentication for v0.1
- Local-only execution

## v0.1 Goal

Build the smallest working prototype that can:

1. Load a Nextflow run folder path
2. Parse `dag.dot`
3. Parse `trace.txt`
4. Serve graph data from the backend
5. Render nodes and edges in the frontend
6. Show basic task details when clicking a node

## Important Constraints

- Keep changes small and testable
- Do not over-engineer
- Prefer simple readable code
- Do not add cloud services
- Do not add authentication
- Do not add a database
- Avoid unnecessary dependencies
- Treat genomic/sample data as sensitive
- Do not send data to external services
- Do not rewrite unrelated files
- Do not introduce large framework changes unless explicitly requested

## Expected Nextflow Inputs

The tool should expect some or all of the following files in a Nextflow run directory:

```text
.nextflow.log
trace.txt
dag.dot
timeline.html
report.html
work/
```

For v0.1, focus first on:

```text
dag.dot
trace.txt
work/
```

## Preferred Repo Structure

```text
backend/
  app.py
  parsers/
    dag_parser.py
    trace_parser.py
  models.py

frontend/
  src/
    App.tsx
    Graph.tsx
    NodeInspector.tsx

sample_runs/
README.md
SPEC.md
CLAUDE.md
```

## Backend Requirements

Use FastAPI.

Initial endpoints:

```text
GET /health
GET /graph
```

`GET /health` should return a simple status response.

`GET /graph` should initially return placeholder graph JSON, then later return parsed graph data from a supplied Nextflow run directory.

The backend should be simple and readable.

## Frontend Requirements

Use React and TypeScript.

The first version should:

- Call the backend `/graph` endpoint
- Render nodes and edges
- Allow clicking a node
- Display selected node details in a side panel

The graph does not need to be beautiful initially. It needs to work.

## Graph Behaviour

Node colours should eventually represent task status:

```text
Green  = completed
Red    = failed
Blue   = cached
Grey   = skipped or unknown
Orange = warning or retried
```

Initial placeholder rendering is acceptable.

## Data Model

Use a simple graph structure:

```ts
type WorkflowNode = {
  id: string
  label: string
  processName?: string
  status?: "COMPLETED" | "FAILED" | "CACHED" | "SKIPPED" | "UNKNOWN"
  workDir?: string
  exitCode?: number
  duration?: string
  cpus?: number
  memory?: string
}

type WorkflowEdge = {
  source: string
  target: string
}

type WorkflowGraph = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}
```

## Development Style

Work incrementally.

For each change:

1. Explain what will be changed
2. Make the smallest useful change
3. Tell me how to test it
4. Do not rewrite unrelated files
5. Prefer practical working code over perfect architecture

## First Milestone

Create a scaffold where:

- `GET /health` returns OK
- `GET /graph` returns placeholder graph JSON
- The frontend renders the placeholder graph
- A clicked node appears in a simple inspector panel

Do not implement full Nextflow parsing until the scaffold is working.

## Second Milestone

Add real parsing for:

- `dag.dot`
- `trace.txt`

Then map parsed process/task status onto graph nodes.

## Later Milestones

- Load `.command.sh`
- Load `.command.err`
- Load `.command.out`
- Load `.command.log`
- Highlight failed nodes
- Show last 50 lines of error logs
- Export a debug bundle for a selected failed node
- Compare two runs
- Package as a local desktop app using Tauri or Electron

## Security Notes

This project may be used with sensitive genomic and public health data.

Assume:

- Sample IDs may be sensitive
- File paths may be sensitive
- Logs may contain sensitive information
- Outputs should remain local by default

Do not add telemetry, analytics, remote logging, cloud upload, or external API calls.

## Instruction to Claude Code

Read this file before making changes.

Follow the v0.1 goal and first milestone unless asked otherwise.

Do not overbuild.
