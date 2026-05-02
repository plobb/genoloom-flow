# GenoLoom Flow Demo Script

This script is designed for a short 60 to 90 second walkthrough of GenoLoom Flow.

The aim is to show the core loop:

```text
Run → visualise → identify failure → inspect evidence
```

---

## 1. Local setup

### Requirements

Install these first:

- Python 3.10+
- Node.js 18+
- Nextflow
- Docker

Check versions:

```bash
python3 --version
node --version
npm --version
nextflow -version
docker --version
```

---

## 2. Install dependencies

From the project root:

```bash
cd ~/projects/genoloom-flow
```

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate

cd backend
pip install -r requirements.txt
```

### Frontend

In a second terminal:

```bash
cd ~/projects/genoloom-flow/frontend
npm install
```

---

## 3. Start the app

### Terminal 1, backend

```bash
cd ~/projects/genoloom-flow
source .venv/bin/activate
cd backend
python -m uvicorn app:app --reload
```

Backend URL:

```text
http://localhost:8000
```

Health check:

```text
http://localhost:8000/health
```

### Terminal 2, frontend

```bash
cd ~/projects/genoloom-flow/frontend
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

---

## 4. Demo walkthrough

### Opening line

> This is GenoLoom Flow, a local-first Nextflow workbench and debugger.

Show the main interface with:

- Runs sidebar
- Process graph
- Inspector panel
- Workbench and Debugger modes

---

## 5. Show the workbench

Switch to:

```text
Workbench
```

Say:

> The workbench lets me launch approved nf-core workflows locally.

Show the workflow cards:

- nf-core/demo
- nf-core/rnaseq test profile

Click:

```text
Run test profile
```

for `nf-core/rnaseq`, or select an existing completed run if you do not want to wait.

Say:

> This creates a local Nextflow run and captures the DAG, trace, report, and timeline outputs.

---

## 6. Show process view

Switch to:

```text
Debugger → View → Process view
```

Say:

> Process view collapses a large task-level DAG into a clean process-level map.

Point out:

- Green completed nodes
- Red failed nodes
- Task counts under each process
- Left-to-right pipeline flow

Say:

> This makes a complex nf-core workflow readable at a glance.

---

## 7. Follow a failure

Click a failed process node.

Say:

> When a process fails, GenoLoom highlights the failure path and shows the likely root cause.

Show:

- Failure path highlighting
- Root cause candidate
- Jump to root cause button

Say:

> This helps separate the first failing step from downstream noise.

---

## 8. Drill into tasks

With a process selected, click:

```text
View tasks
```

Say:

> From the process view, I can drill into individual task executions.

Show:

- Task list
- Status colours
- Header counts
- Command, Stdout, Stderr buttons

Hover over task rows.

Say:

> Hovering a task highlights where it sits in the graph.

Click a task row.

Say:

> Clicking a task jumps to the exact task in the full DAG.

---

## 9. Inspect evidence

Open:

```text
Command
Stdout
Stderr
```

Say:

> Instead of digging through work directories, I can inspect the command and logs directly in the app.

Then open:

```text
Report
Timeline
```

from Run Info.

Say:

> Reports and timelines are embedded, so I keep the graph context while reviewing run artefacts.

---

## 10. Closing line

> GenoLoom Flow brings running, monitoring, and debugging Nextflow workflows into one local-first interface.

Optional shorter close:

> It turns Nextflow outputs into a visual debugging surface.

---

## 11. Suggested 60 second version

Use this if recording a short video.

```text
This is GenoLoom Flow, a local-first Nextflow workbench and debugger.

I can launch approved nf-core workflows locally, or inspect existing Nextflow outputs.

Here I am looking at an nf-core RNA-seq run in Process view. Instead of the full task-level DAG, the workflow is collapsed into readable process nodes with task counts and status.

When something fails, I can click the failed process and immediately see the failure path and a likely root cause.

From there I can drill into the individual tasks, inspect command, stdout, and stderr, and open the Nextflow report and timeline without leaving the app.

The goal is simple: move from failure to understanding much faster.
```

---

## 12. Notes for recording

Recommended recording flow:

1. Start with a completed or failed run already available.
2. Use Process view first.
3. Click a failed process.
4. Show root cause.
5. Open View tasks.
6. Open Stderr or Command.
7. Open Report or Timeline.
8. End on the full graph or Workbench page.

Avoid showing:

- long installs
- terminal errors
- source code
- full DAG first, unless comparing against Process view

---

## 13. Useful commands

Check current git status:

```bash
git status
```

Run backend:

```bash
cd ~/projects/genoloom-flow
source .venv/bin/activate
cd backend
python -m uvicorn app:app --reload
```

Run frontend:

```bash
cd ~/projects/genoloom-flow/frontend
npm run dev
```

Generate Nextflow artefacts manually:

```bash
nextflow run <pipeline> \
  -with-dag dag.dot \
  -with-trace trace.txt \
  -with-report report.html \
  -with-timeline timeline.html
```

Commit documentation changes:

```bash
git add README.md docs/demo-script.md
git commit -m "Update README and add demo script"
git push
```
