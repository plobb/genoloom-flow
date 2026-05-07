<p align="center">
  <img src="assets/genoloom_preview.png" alt="genoloom-flow preview" width="100%">
</p>

# genoloom-flow

**Debug Nextflow pipelines. Instantly.**

GenoLoom Flow is a local-first Nextflow workflow visualiser, debugger, and lightweight nf-core workbench. It helps you inspect pipeline structure, follow execution state, identify failures, and explore run artefacts without jumping between terminals, work directories, and reports.

**Live demo: https://genoloom-flow.fly.dev/**

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
- Explain common failure patterns from stderr — missing files, permission errors, Java memory errors, command-not-found, and container image issues

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

**Live failure demo: https://genoloom-flow.fly.dev/**

The hosted demo opens directly into an RNA-seq failure scenario and highlights a missing GATK reference dictionary (`.dict`) error.

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

## Docker local viewer mode

Run the frontend and backend together without any local Python or Node setup:

```bash
docker compose up --build
```

| Service  | URL                     |
|----------|-------------------------|
| Frontend | http://localhost:5173   |
| Backend  | http://localhost:8000   |

**What works in this mode:**

- Viewing the bundled sample run
- Uploading a `dag.dot` (and optional `trace.txt`) to visualise any Nextflow run
- Process view, task drill-down, root-cause detection, and summary panels

**What does not work in this mode:**

- Running nf-core pipelines (`Run` menu / Workbench) — Nextflow execution requires a native host setup with Nextflow and Docker installed. See [Running locally](#running-locally) for that workflow.

The UI reflects this automatically: in Docker viewer mode (`VITE_VIEWER_MODE=true`) the **Run** menu trigger is greyed out and disabled, Workbench cards show a **View only** badge instead of **Runnable**, and a notice is displayed explaining why execution is unavailable.

**Environment variables** (set in `docker-compose.yml`, override as needed):

| Variable            | Default                   | Purpose                                         |
|---------------------|---------------------------|-------------------------------------------------|
| `VITE_API_URL`      | `http://localhost:8000`   | Backend URL seen by the browser                 |
| `VITE_VIEWER_MODE`  | `true`                    | Disables pipeline execution controls in the UI  |
| `CORS_ORIGINS`      | `http://localhost:5173`   | Origins the backend will accept                 |

## Production container

The repo includes a root `Dockerfile` for single-container deployment. It builds the React frontend with Vite and serves the static output through FastAPI, so a single container handles everything.

This is used for the Fly.io demo at https://genoloom-flow.fly.dev/.

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
