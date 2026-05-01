# GenoLoom Flow

Interactive Nextflow workflow visualiser and debugger.

## Features

- Upload and explore Nextflow DAGs
- Visualise pipeline structure with D3
- Track task status (running, completed, failed)
- Inspect node-level execution details
- View Nextflow reports and timelines inline
- Run local nf-core workflows

## Why

Nextflow pipelines are powerful but hard to debug visually.  
GenoLoom Flow provides a fast, interactive way to understand what is happening inside a run.

## Demo

Coming soon.

## Roadmap

- Real-time task updates
- nf-core workflow integration
- Cloud execution (AWS)
- Token-based auth + multi-user runs

## Author

Philip Lobb
A local-first developer tool for inspecting and debugging Nextflow pipeline runs.

## Requirements

- Python 3.10+
- Node.js 18+

## Running (development)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

Runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`.

## Testing milestone 2A (dag.dot parsing)

With the backend running, hit the graph endpoint:

```bash
curl http://localhost:8000/graph | python3 -m json.tool
```

Expected response: nodes and edges parsed from `sample_runs/example/dag.dot`.

To test with your own run, replace `sample_runs/example/dag.dot` with your file
(the hardcoded path is in `backend/app.py`, `_RUN_DIR`).

## Sample run

`sample_runs/example/dag.dot` — a small synthetic pipeline (FASTQC → TRIMGALORE → BWA_MEM → SAMTOOLS_SORT → … → MULTIQC) that exercises the parser without real data.
