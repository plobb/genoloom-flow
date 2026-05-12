<p align="center">
  <img src="assets/genoloom_preview.png" alt="genoloom-flow preview" width="100%">
</p>

# genoloom-flow

**Debug Nextflow pipelines. Instantly.**

GenoLoom Flow is a local-first Nextflow run inspector and failure debugger. It provides a persistent run library, grouped failure analysis, and inline log inspection -- without sending data outside your environment.

**Live demo: https://genoloom-flow.fly.dev/**

---

## Current capabilities

- Import Nextflow run archives and maintain a persistent run library
- Visualise DAGs interactively (Process view and Full DAG view)
- Browse grouped failure signatures across all tasks in a run
- Drill down from process to individual tasks and their logs
- Inspect command scripts, stdout, and stderr inline
- View Nextflow reports and timelines in-app
- Archive and delete runs from the library
- Mount a run directory without importing
- Run local nf-core workflows and capture artefacts (native host only)

See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, storage, and operational guidance.
Bundle helper: [scripts/create_genoloom_bundle.sh](scripts/create_genoloom_bundle.sh)

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

GenoLoom Flow brings all of this into a single visual debugging surface. Failures are grouped by error signature at import time so you can triage at scale -- 144 tasks failing with the same Java OOM error appears as one entry, not 144 separate log hunts. The goal is to move quickly from **failure → understanding → fix**.

---

## Run import workflow

1. Run Nextflow on your cluster or workstation with DAG and trace flags
2. Package outputs into a bundle
3. Import the archive via **Upload > Import run archive (.tar.gz)**
4. Inspect grouped failures, browse task logs, view reports
5. Archive or delete the run when the investigation is complete

```bash
# Generate artefacts
nextflow run <pipeline> \
  -with-dag dag.dot \
  -with-trace trace.txt \
  -with-report report.html \
  -with-timeline timeline.html

# Bundle for import
./scripts/create_genoloom_bundle.sh \
  --run-dir /path/to/run \
  --name my_run_name \
  --out-dir .

# Or manually
tar -czf my_run.tar.gz dag.dot trace.txt work_dir/
```

---

## Remote upload helper

For runs that live on a remote cluster or HPC node, GenoLoom provides a self-contained upload script that bundles the run and optionally SCPs it directly into the imports folder.

**Download**: **Upload > Download remote upload tool** in the GenoLoom web UI saves `genoloom-upload.sh` to your local machine. Copy it to the machine where the Nextflow run lives.

```bash
chmod +x genoloom-upload.sh
```

**Local bundle only** (then manually copy the archive):

```bash
./genoloom-upload.sh \
  --run-dir /path/to/nextflow/run \
  --name failed_run \
  --out-dir /tmp
```

**Remote upload** (SCP directly to the GenoLoom imports folder):

```bash
./genoloom-upload.sh \
  --run-dir /path/to/nextflow/run \
  --name failed_run \
  --host genoloom.example.org \
  --user genoloom-upload \
  --remote-dir /srv/genoloom/runs/imports
```

After the upload completes, use **Upload > Scan imports folder**, then click **Import** next to the bundle.

**Artefacts bundled:**

| File | Status |
|---|---|
| `dag.dot` | Required — pipeline graph |
| `trace.txt` | Recommended — enables task status and failure grouping |
| `report.html`, `timeline.html` | Optional |
| `.nextflow.log` | Optional |
| `work/` or `work_dir/` | Optional — normalised to `work_dir/` inside the archive; exclude with `--no-work` |

Generate these artefacts by running Nextflow with:

```bash
nextflow run <pipeline> \
  -with-dag dag.dot \
  -with-trace trace.txt \
  -with-report report.html \
  -with-timeline timeline.html
```

Uploads use a `.partial` suffix during transfer and are renamed to `.tar.gz` only once complete. GenoLoom ignores `.partial` files during scans, so incomplete uploads never appear in the import list.

---

## Key features

### Graph views

- **Process view**: high-level overview with aggregate task counts and failure status
- **Full DAG view**: task-level detail
- Seamless switching between both

### Failure analysis

- Grouped error signatures across all failed tasks (Java OOM, missing file, permission denied, container errors, and exit code fallback)
- Root-cause detection with jump navigation
- Failed task count and top error signature shown in the sidebar without opening the run

### Task drill-down

- Expand a process into its constituent tasks
- Click a task to jump to its position in the graph
- Hover tasks to highlight their node

### Artefact inspection

- Command script, stdout, stderr -- all inline
- Nextflow HTML report and timeline in-app
- No context switching to terminals or work directories

### Persistent run library

- Imported runs stored in `./runs/`, survive container restarts
- Archive runs to hide without deleting
- Delete archived runs permanently from the UI
- Duplicate import names automatically suffixed

---

## Quick start

```bash
git clone https://github.com/phillobb/genoloom-flow.git
cd genoloom-flow
docker compose up --build
```

| Service  | URL                   |
|----------|-----------------------|
| Frontend | http://localhost:5173 |
| Backend  | http://localhost:8000 |

Run import, the persistent run library, task drill-down, and log inspection all work in this mode. Pipeline execution via the **Run** menu requires a native host setup -- see [Running locally](#running-locally).

---

## Running locally

Without Docker, run backend and frontend separately. This mode enables pipeline execution via the **Run** menu and **Workbench** (requires Nextflow and Docker installed on the host).

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
# http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev
# http://localhost:5173
```

---

## Deployment and operations

Full deployment, storage management, HPC usage, and cleanup documentation: **[DEPLOYMENT.md](DEPLOYMENT.md)**

Includes:
- Persistent storage layout
- Mounted bundle mode (`BUNDLE_PATH`)
- HPC bundle-and-import workflow
- Archive and delete procedures
- Configuration reference
- Known limitations

---

## Roadmap

- Live run monitoring during active Nextflow execution
- Searchable and filterable run library
- Workflow execution and workbench integration
- AI-assisted failure explanation from stderr
- nf-core catalogue integration
- Multi-user deployment

---

## Author

Philip Lobb

---

## License

MIT
