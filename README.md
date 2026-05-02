<p align="center">
  <img src="assets/genoloom_preview.png" alt="genoloom-flow preview" width="100%">
</p>

# genoloom-flow

**Debug Nextflow pipelines. Instantly.**

GenoLoom Flow is a local-first Nextflow workflow visualiser, debugger, and lightweight nf-core workbench. It helps you inspect pipeline structure, follow execution state, identify failures, and explore run artefacts without jumping between terminals, work directories, and reports.

---

## What it does

GenoLoom Flow helps you:

- Visualise Nextflow DAGs interactively
- Switch between **Process view** and **Full DAG view**
- Track task status across a run
- Identify failed steps and follow failure paths
- Jump directly to **root cause** nodes
- Drill down from process → task → logs
- Inspect command, stdout, stderr inline
- View Nextflow reports and timelines in-app
- Run local nf-core workflows (demo + rnaseq test)
- Compare multiple runs side-by-side

---

## Why

Debugging Nextflow pipelines is fragmented.

When something fails, useful information is scattered across:

- dag.dot
- trace.txt
- .command.sh
- .command.out
- .command.err
- report.html
- timeline.html
- the Nextflow work directory

GenoLoom Flow brings all of this into a single visual debugging surface so you can move quickly from **failure → understanding → fix**.

---

## Key features

### Graph views

- **Process view**: clean, high-level overview
- **Full DAG view**: task-level detail
- Seamless switching between both

### Failure debugging

- Follow failure paths through the workflow
- Highlight upstream/downstream context
- Root-cause detection with jump navigation

### Task drill-down

- Expand a process into its constituent tasks
- Click a task to jump to its exact node
- Hover tasks to highlight their position in the graph

### Artefact inspection

- View:
  - Command
  - Stdout
  - Stderr
  - Report
  - Timeline
- All inside the app, no context switching

### Local execution

- Run:
  - nf-core/demo
  - nf-core/rnaseq (test profile)
- Automatically capture DAG, trace, and artefacts

---

## Demo

👉 [Demo script](docs/demo-script.md)
---

## Demo modes

### Sample run
Loads a bundled example graph and trace.

### Simulated workflow
Frontend-only demo with animated node updates.

### Local nf-core workflows
Runs real pipelines locally and visualises execution:
- nf-core/demo
- nf-core/rnaseq (test)

---

## Running locally

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

Backend:
```
http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend:
```
http://localhost:5173
```

---

## Typical workflow

1. Start backend and frontend
2. Open http://localhost:5173
3. Run or load a workflow
4. Switch to Process view
5. Identify a failed node
6. Jump to root cause
7. Drill into tasks
8. Inspect logs and outputs

---

## Generating Nextflow artefacts

```bash
nextflow run <pipeline> \
  -with-dag dag.dot \
  -with-trace trace.txt \
  -with-report report.html \
  -with-timeline timeline.html
```

---

## Roadmap

- Live trace streaming
- Improved error extraction
- nf-core catalogue integration
- Parameter UI (nextflow_schema.json)
- Containerised deployment
- Cloud execution (AWS)
- Optional LLM-assisted debugging

---

## Author

Philip Lobb

---

## License

MIT
