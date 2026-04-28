# Nexflow Debugger v0.1 Specification

## 1. Overview

Nexflow Debugger is a local-first desktop-style developer tool for inspecting, debugging, and understanding Nextflow pipeline runs. It ingests an existing Nextflow run directory and renders an interactive workflow graph using D3.js, with detailed per-task inspection capabilities.

This tool is designed for bioinformatics engineers and analysts working with complex pipelines, particularly in secure environments (e.g. HPC, government infrastructure) where data cannot leave the local system.

---

## 2. Goals

- Provide a visual representation of a Nextflow workflow execution
- Enable rapid identification of failed tasks
- Allow deep inspection of task-level execution details
- Improve debugging speed and clarity
- Support reproducibility and handover via debug bundles

---

## 3. Non-Goals (v0.1)

- Cloud deployment
- Multi-user collaboration
- Authentication/authorization
- Editing or modifying workflows
- Real-time monitoring of running pipelines

---

## 4. Input Requirements

The tool expects a completed Nextflow run directory containing:

```
.nextflow.log
trace.txt
dag.dot
timeline.html (optional)
report.html (optional)
work/
```

---

## 5. Architecture

### Backend
- Python (FastAPI)
- Responsibilities:
  - Parse input files
  - Build internal data model
  - Serve JSON API

### Frontend
- React + TypeScript
- D3.js for graph rendering
- Responsibilities:
  - Render workflow graph
  - Handle user interaction
  - Display node inspection panel

### Execution Model

```
nexflow-debugger /path/to/run
```

Launches a local server:

```
http://localhost:8000
```

---

## 6. Data Model

### WorkflowNode

```
{
  id: string,
  label: string,
  processName?: string,
  status?: "COMPLETED" | "FAILED" | "CACHED" | "SKIPPED",
  workDir?: string,
  exitCode?: number,
  duration?: string,
  cpus?: number,
  memory?: string,
  inputs?: string[],
  outputs?: string[],
  commandFiles?: {
    sh?: string,
    out?: string,
    err?: string,
    log?: string
  }
}
```

---

## 7. Parsing Strategy

### dag.dot
- Parse into nodes and edges
- Defines workflow structure

### trace.txt
- Parse TSV
- Map task execution metadata

### work/
- Locate task directories
- Extract:
  - `.command.sh`
  - `.command.out`
  - `.command.err`
  - `.command.log`

### .nextflow.log
- Extract high-level errors and warnings

---

## 8. UI Layout

### Main View

```
---------------------------------
| Graph Panel | Inspector Panel |
---------------------------------
```

### Graph Panel
- Interactive D3 graph
- Nodes represent processes/tasks
- Edges represent dependencies

### Inspector Panel
Tabs:

- Summary
- Command
- Inputs
- Outputs
- Logs
- Resources
- Dependencies

---

## 9. Graph Behaviour

### Node Colours

```
Green  = Completed
Red    = Failed
Blue   = Cached
Grey   = Skipped
Orange = Warning/Retried
```

### Interactions

- Click node → open inspector
- Hover → quick summary tooltip
- Zoom + pan
- Filter by:
  - Status
  - Process name
  - Sample ID (if available)

---

## 10. Node Inspector Details

### Summary Tab
- Process name
- Status
- Exit code
- Runtime
- Resource usage
- Work directory

### Command Tab
- `.command.sh`

### Logs Tab
- `.command.out`
- `.command.err`
- `.command.log`

### Inputs/Outputs
- File paths (from trace/work dir)

### Dependencies
- Upstream nodes
- Downstream nodes

---

## 11. Debugging Features

### Failure Highlighting
- Automatically focus on failed nodes

### Error Preview
- Show last 50 lines of `.command.err`

### Work Directory Access
- Direct path display for manual inspection

---

## 12. Debug Bundle Export

For a selected node, generate:

```
debug_bundle/
├── summary.md
├── .command.sh
├── .command.err
├── .command.out
├── .command.log
├── trace_row.txt
└── work_dir_listing.txt
```

Purpose:
- Shareable debugging artefact
- Supports collaboration and issue tracking

---

## 13. Security & Privacy

- Runs entirely locally
- No external network calls
- No data leaves user environment
- Suitable for sensitive genomic data workflows

---

## 14. Future Enhancements

### v0.2
- Expand/collapse task-level view
- Timeline integration
- Resource usage charts

### v0.3
- Compare two runs
- Performance regression detection

### Public GenoLoom Version
- Upload sanitized run bundles
- Shareable visualizations
- Web-based explorer

---

## 15. Stretch Ideas

- Rerun failed task button (generate Nextflow command)
- Integration with Nextflow Tower (optional)
- AI-assisted error summarisation

---

## 16. Development Plan (MVP)

1. Parse `dag.dot`
2. Parse `trace.txt`
3. Build internal node graph
4. Serve via FastAPI
5. Render basic D3 graph
6. Add node click → inspector
7. Load `.command.*` files
8. Implement debug bundle export

---

## 17. Notes

- Focus on speed of iteration over completeness
- Keep parsing logic simple initially
- Validate with real UKHSA pipeline runs early

---

End of v0.1 Specification

