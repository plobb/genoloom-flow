# Nexflow Debugger

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
