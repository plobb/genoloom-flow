# GenoLoom Flow - Deployment and Operations Guide

## 1. Overview

GenoLoom Flow is a local-first Nextflow pipeline debugger and run inspector. It is designed for bioinformatics teams who need to inspect pipeline failures without sending data to external services.

**Current capabilities:**

- Visualise Nextflow DAGs interactively (process view and full task view)
- Import completed run bundles (dag.dot + trace.txt + optional work outputs)
- Browse grouped task failures by error signature
- Inspect stderr, stdout, and command scripts inline
- View Nextflow HTML reports and timelines in-app
- Archive and manage a persistent run library

**Current scope:**

GenoLoom Flow is a read-only debugging and inspection tool. It is not a workflow scheduler or execution platform. The pipeline execution features (Run menu, nf-core Workbench) require a local native setup with Nextflow and Docker installed on the host and are separate from the inspection workflow described here.

It is designed for trusted internal environments. There is currently no authentication and no multi-user access control.

---

## 2. Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Ports 5173 and 8000 available on the host

### Clone and start

```bash
git clone https://github.com/phillobb/genoloom-flow.git
cd genoloom-flow
docker compose up --build
```

On first build this will download base images and install dependencies. Subsequent starts without code changes are faster:

```bash
docker compose up
```

| Service  | URL                   |
|----------|-----------------------|
| Frontend | http://localhost:5173 |
| Backend  | http://localhost:8000 |

The frontend opens in viewer mode by default (`VITE_VIEWER_MODE=true`). Pipeline execution controls are disabled in this mode. The run import, archive, and inspection features work fully.

### Stop

```bash
docker compose down
```

Imported runs in `./runs/` are not affected by stopping or restarting the containers.

---

## 3. Persistent Storage

### Where data lives

| Path (host)       | Mounted at (container) | Contents                                             |
|-------------------|------------------------|------------------------------------------------------|
| `./runs/`         | `/app/runs/`           | Imported run archives, one subdirectory per run      |
| `./work/`         | `/app/work/`           | Work directory for locally launched nf-core runs     |
| `./sample_runs/`  | `/app/sample_runs/`    | Bundled sample data (read-only in practice)          |
| `$BUNDLE_PATH`    | `/app/bundle/` (ro)    | Optional single mounted run bundle (see below)       |

The `./runs/` directory is the primary persistent store. It survives container restarts, rebuilds, and image updates because it is a bind mount on the host filesystem.

### Run types

| Type | Where stored | Persists after restart | Archivable / deletable |
|------|--------------|------------------------|------------------------|
| Imported run | `./runs/<uuid>/` | Yes | Yes |
| Mounted bundle | Host path via `BUNDLE_PATH` | Depends on host path | No (read-only mount) |
| Uploaded dag.dot | In memory only | No | No |
| Demo / simulated | In memory only | No | No |

**Imported run:** A `.tar.gz` archive uploaded through the UI. Extracted into `./runs/<uuid>/`, with a `meta.json` written alongside the run data. Persists indefinitely until deleted through the UI or manually from the host.

**Mounted bundle:** A single run directory made available to the container via the `BUNDLE_PATH` environment variable. Useful for pointing the tool at a fixed location without importing. The bundle is mounted read-only.

**Uploaded dag.dot:** Uploaded directly without archiving. Parsed in memory only; lost on page reload or container restart.

**Demo / simulated:** Simulated execution for demonstration. In memory only.

---

## 4. Creating a Run Bundle

A run bundle is a `.tar.gz` archive containing Nextflow run artefacts. The minimum required is `dag.dot`. Including `trace.txt` enables task-level analysis. Including the `work_dir/` enables stderr inspection, command viewing, and grouped error analysis.

### Expected structure

```
run.tar.gz
├── dag.dot            required
├── trace.txt          recommended
├── report.html        optional
├── timeline.html      optional
└── work_dir/          optional but recommended
    ├── ab/
    │   └── 1a2b3c.../
    │       ├── .command.sh
    │       ├── .command.out
    │       └── .command.err
    └── ...
```

The archive may also contain a single top-level directory wrapping these files; GenoLoom Flow will hoist its contents automatically.

### Generating artefacts with Nextflow

Add these flags to any `nextflow run` command:

```bash
nextflow run <pipeline> \
  -with-dag dag.dot \
  -with-trace trace.txt \
  -with-report report.html \
  -with-timeline timeline.html
```

### Packaging the bundle

```bash
tar -czf run.tar.gz dag.dot trace.txt work_dir/
```

Include `report.html` and `timeline.html` if available:

```bash
tar -czf run.tar.gz dag.dot trace.txt report.html timeline.html work_dir/
```

A helper script is provided at `scripts/create_genoloom_bundle.sh`:

```bash
./scripts/create_genoloom_bundle.sh \
  --run-dir /path/to/nextflow/output \
  --name my_run_name \
  --out-dir /scratch/bundles

# With optional imports-dir for a running GenoLoom instance:
./scripts/create_genoloom_bundle.sh \
  --run-dir /path/to/nextflow/output \
  --name my_run_name \
  --out-dir /scratch/bundles \
  --imports-dir /srv/genoloom/runs/imports
```

Run `./scripts/create_genoloom_bundle.sh --help` for full usage.

### What `work_dir/` enables

Without `work_dir/`, GenoLoom Flow can show process-level task counts and statuses but cannot open task logs. With it:

- Stderr content is inspected at import time to classify failure signatures
- Failed tasks are grouped by error type (Java OOM, missing file, permission denied, etc.)
- Individual task commands and output files can be viewed inline

The `work_dir/` can be large. Include it when the primary goal is failure investigation. Omit it for lighter imports when only the DAG structure and trace counts are needed.

---

## 5. HPC Usage Example

A common workflow for HPC users is to run the pipeline on the cluster, copy the relevant outputs to a workstation or server running GenoLoom Flow, and import them for inspection.

### Step 1 - Run the pipeline on the cluster

```bash
nextflow run my-pipeline \
  -with-dag dag.dot \
  -with-trace trace.txt \
  -with-report report.html
```

### Step 2 - Package the outputs

```bash
# On the HPC node or login node
./scripts/create_genoloom_bundle.sh \
  --run-dir /path/to/pipeline/output \
  --name my_pipeline_run \
  --out-dir /scratch/bundles
```

Or manually:

```bash
tar -czf my_pipeline_run.tar.gz \
  dag.dot \
  trace.txt \
  report.html \
  work/
```

If `work/` is very large, you can exclude it with `--no-work` and still get DAG structure and task counts from `trace.txt`. Task log inspection will be unavailable without the work directory.

### Step 3 - Copy to your workstation

```bash
scp user@hpc-login:/path/to/my_pipeline_run.tar.gz ./
```

Or use `rsync` for reliability over slow connections:

```bash
rsync -avz --progress user@hpc-login:/path/to/my_pipeline_run.tar.gz ./
```

### Step 4 - Import into GenoLoom Flow

With GenoLoom Flow running locally:

1. Open http://localhost:5173
2. Click **Upload** in the header
3. Select **Import run archive (.tar.gz)**
4. Select `my_pipeline_run.tar.gz`

The run appears in the left sidebar with its name derived from the filename. Task counts, failed process count, and the top error signature are computed at import time and shown in the sidebar without needing to open the run.

### Using the mounted bundle mode

If you prefer not to import and want to point GenoLoom Flow directly at a directory:

```bash
BUNDLE_PATH=/path/to/run/directory docker compose up
```

The run will be available via **Upload > Open mounted run** in the UI. This is suitable for cases where the run directory is already on the local host or a mounted network filesystem. The directory is read-only from the container's perspective.

---

## 6. Cleanup and Storage Management

### Run library

Imported runs accumulate in `./runs/` as separate UUID-named directories. Each directory contains the extracted run artefacts and a `meta.json` file with display name, source, status, and computed summary metadata.

### Archiving

To hide a run from the default sidebar view without deleting it:

1. Hover over the run in the sidebar
2. Click **⊟** (archive)

The run is marked as archived in its `meta.json` and hidden from the default list. To see archived runs, click **Show archived** at the bottom of the sidebar.

To restore a run:

1. Click **Show archived**
2. Hover over the archived run
3. Click **↩** (unarchive)

### Deleting

Deletion is permanent and removes the run directory from `./runs/`. A run must be archived before it can be deleted.

1. Archive the run (see above)
2. With archived runs visible, hover over the run
3. Click **✕** (delete)
4. Confirm the dialog

The API endpoint (`DELETE /api/runs/{run_id}`) enforces the archived-first requirement. Attempting to delete a non-archived run via the API returns HTTP 409.

### Manual cleanup

To remove runs directly from the host (outside the UI):

```bash
# List all runs with their display names
for d in ./runs/*/; do
  echo "$d"
  cat "$d/meta.json" 2>/dev/null | python3 -c "import sys,json; m=json.load(sys.stdin); print('  ', m.get('display_name','?'), '-', m.get('status','?'), '- archived:', m.get('archived', False))" 2>/dev/null
done

# Remove a specific run
rm -rf ./runs/<uuid>
```

There is no risk of affecting the container: runs are loaded on demand, not held open by the backend process.

### Storage sizing

Rule of thumb: a run bundle with `work_dir/` can range from tens of megabytes (small pipelines) to several gigabytes (large genomics runs with many tasks). If storage is constrained, import without `work_dir/` for structure-only inspection, or delete runs after investigation.

---

## 7. Configuration Reference

### Environment variables

| Variable           | Default                 | Description                                                   |
|--------------------|-------------------------|---------------------------------------------------------------|
| `BUNDLE_PATH`      | `./sample_bundle`       | Host path mounted as the read-only bundle at `/app/bundle/`   |
| `CORS_ORIGINS`     | `http://localhost:5173` | Comma-separated origins the backend will accept               |
| `VITE_API_URL`     | `http://localhost:8000` | Backend URL used by the browser (build-time variable)         |
| `VITE_VIEWER_MODE` | `true`                  | Set to `false` to enable pipeline execution controls          |

To override `BUNDLE_PATH` without editing `docker-compose.yml`:

```bash
BUNDLE_PATH=/data/my-pipeline-run docker compose up
```

---

## 8. Known Limitations

- **No authentication.** The application is designed for trusted internal environments. Do not expose it publicly without a reverse proxy with appropriate access controls.
- **No multi-user support.** There is a single shared run library. Concurrent imports or deletions from different browser sessions may produce unexpected results.
- **No execution scheduling.** The pipeline execution features (Run menu, Workbench) require Nextflow and Docker installed natively on the host and are not available in the Docker viewer mode described in this guide.
- **Large `work_dir/` imports may take time.** At import, up to 4 KB is read from each failed task's stderr to classify errors. A run with thousands of failures will take longer to import than one with few.
- **Metadata computed at import time only.** Summary metadata (task counts, top error) is written once into `meta.json` at import and not automatically refreshed. To update it, re-import the archive.
- **No search or filtering.** The sidebar run library is ordered by import date. There is no search across run names, error types, or task content.
- **Sample data is bundled.** The sample run loaded on startup comes from `./sample_runs/` and is not representative of any real pipeline.
- **Sensitive data stays local.** No telemetry, analytics, or external API calls are made. Sample IDs, file paths, and log content remain on the host.

---

## 9. Roadmap

- Live run monitoring during active Nextflow execution
- Search and filtering across the run library
- AI-assisted failure explanation from stderr content
- nf-core pipeline catalogue integration
- Rename and tag runs in the library
- Multi-user deployment with basic access controls
- Export of debug bundles and summaries

---

## 10. Troubleshooting

**Container fails to start with port conflict:**

```bash
# Check what is using the ports
lsof -i :5173 -i :8000
# Stop conflicting process, then retry
docker compose up
```

**Frontend cannot reach backend (CORS error in browser console):**

Check that `CORS_ORIGINS` in `docker-compose.yml` matches the URL you are accessing the frontend on. If accessing from a different host, add that origin.

**Import fails with "No dag.dot found in archive":**

The archive must contain a `dag.dot` file at the top level or inside a single top-level directory. Verify the archive structure:

```bash
tar -tzf my_run.tar.gz | head -20
```

**Runs disappear after restarting containers:**

Check that `./runs/` exists on the host and is listed as a volume in `docker-compose.yml`. If you wiped the directory or changed the compose file, previously imported runs will not reappear.

**Work directory files show "File not found" when viewing tasks:**

The `work_dir/` inside the bundle must have been included at import time. If it was omitted, task-level file inspection is unavailable for that run. Re-import with `work_dir/` included.
