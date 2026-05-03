import json
import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse

from models import WorkflowGraph, WorkflowNode, WorkflowEdge
from parsers.dag_parser import parse_dag, parse_dag_content
from parsers.trace_parser import parse_trace_content
from runners.nextflow_runner import run_nf_core_demo, run_nf_core_rnaseq, get_run_status

app = FastAPI(title="GenoLoom")

_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "sample_runs", "example")
_SAMPLE_DOT = os.path.join(_SAMPLE_DIR, "dag.dot")
_SAMPLE_TRACE = os.path.join(_SAMPLE_DIR, "trace.txt")

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_RUNS_DIR = _PROJECT_ROOT / "runs"
_WORK_DIR = _PROJECT_ROOT / "work"
_FILE_LIMIT = 200 * 1024  # 200 KB

_ARTEFACTS = {
    "dag":      "dag.dot",
    "trace":    "trace.txt",
    "report":   "report.html",
    "timeline": "timeline.html",
    "stdout":   "stdout.txt",
    "stderr":   "stderr.txt",
}


def _read_meta(run_dir: Path) -> dict:
    """Read meta.json from a run directory; return empty dict if absent or invalid."""
    meta_path = run_dir / "meta.json"
    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text())
        except Exception:
            pass
    return {}


def _normalise(name: str) -> str:
    """Lowercase + underscores-to-spaces for fuzzy process name matching."""
    return name.replace("_", " ").lower()


def _resolve_work_dir(work_base: Path, hash_val: str) -> Path:
    """Resolve a (possibly shortened) trace hash to the full work directory.

    Nextflow trace hashes are truncated, e.g. "fa/9526f4", while the actual
    directory is work/fa/9526f4abcdef…  We glob for the first directory under
    work/<prefix>/ whose name starts with <suffix> and return it if found.
    """
    parts = hash_val.split("/", 1)
    if len(parts) == 2:
        prefix, suffix = parts
        prefix_dir = work_base / prefix
        if prefix_dir.is_dir():
            for candidate in sorted(prefix_dir.iterdir()):
                if candidate.is_dir() and candidate.name.startswith(suffix):
                    return candidate
    return work_base / hash_val  # exact fallback


def _build_graph(
    parsed: dict,
    status_map: dict[str, dict] | None = None,
    work_base: Path | None = None,
) -> WorkflowGraph:
    normalised = (
        {_normalise(k): v for k, v in status_map.items()} if status_map else {}
    )

    nodes = []
    for n in parsed["nodes"]:
        rec: dict = normalised.get(_normalise(n["raw_label"])) or {}

        exit_code: int | None = None
        if rec.get("exit"):
            try:
                exit_code = int(rec["exit"])
            except ValueError:
                pass

        # Derive work directory paths from trace hash when a run work_base is known.
        # Nextflow stores task files at work/<hash>/ where hash = "ab/1a2b3c…"
        work_dir: str | None = None
        command_path: str | None = None
        stdout_path: str | None = None
        stderr_path: str | None = None
        hash_val = rec.get("hash")
        if hash_val and work_base is not None:
            resolved = _resolve_work_dir(work_base, hash_val)
            work_dir     = str(resolved)
            command_path = work_dir + "/.command.sh"
            stdout_path  = work_dir + "/.command.out"
            stderr_path  = work_dir + "/.command.err"

        nodes.append(WorkflowNode(
            id=n["id"],
            label=n["label"],
            status=rec.get("status"),
            exitCode=exit_code,
            duration=rec.get("duration"),
            workDir=work_dir,
            commandPath=command_path,
            stdoutPath=stdout_path,
            stderrPath=stderr_path,
            hash=rec.get("hash"),
            task_id=rec.get("task_id"),
            native_id=rec.get("native_id"),
            submit=rec.get("submit"),
            realtime=rec.get("realtime"),
            cpu_pct=rec.get("cpu_pct"),
            peak_rss=rec.get("peak_rss"),
            peak_vmem=rec.get("peak_vmem"),
            rchar=rec.get("rchar"),
            wchar=rec.get("wchar"),
        ))

    edges = [WorkflowEdge(source=e["source"], target=e["target"]) for e in parsed["edges"]]
    return WorkflowGraph(nodes=nodes, edges=edges)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph", response_model=WorkflowGraph)
def graph_sample():
    """Return the built-in sample graph (dag + trace) for demo purposes."""
    if not os.path.exists(_SAMPLE_DOT):
        raise HTTPException(status_code=404, detail="Sample dag.dot not found")
    status_map: dict[str, dict] | None = None
    if os.path.exists(_SAMPLE_TRACE):
        with open(_SAMPLE_TRACE) as fh:
            status_map = parse_trace_content(fh.read())
    return _build_graph(parse_dag(_SAMPLE_DOT), status_map)


@app.get("/api/file", response_class=PlainTextResponse)
def read_task_file(path: str = Query(...)) -> PlainTextResponse:
    """Serve a task file from within the project work/ directory."""
    try:
        resolved = Path(path).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not str(resolved).startswith(str(_WORK_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied: path is outside work/")

    if not resolved.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if not resolved.is_file():
        raise HTTPException(status_code=400, detail="Not a file")

    raw = resolved.read_bytes()[:_FILE_LIMIT]
    return PlainTextResponse(raw.decode("utf-8", errors="replace"))


@app.get("/api/runs")
def list_runs():
    """List all run directories with metadata and artefact availability."""
    if not _RUNS_DIR.exists():
        return []
    result = []
    for d in sorted(_RUNS_DIR.iterdir()):
        if not d.is_dir():
            continue
        meta = _read_meta(d)
        run_stat = get_run_status(d.name, d)
        result.append({
            "run_id":       d.name,
            "run_dir":      str(d),
            "display_name": meta.get("display_name"),
            "workflow":     meta.get("workflow"),
            "status":       run_stat["status"],
            "source":       meta.get("source"),
            "started":      meta.get("started"),
            "completed":    meta.get("completed"),
            "artefacts":    {key: (d / fname).exists() for key, fname in _ARTEFACTS.items()},
        })
    return result


@app.get("/api/runs/{run_id}/status")
def run_status(run_id: str):
    """Return live status and artefact availability for a running or completed run."""
    run_dir = (_RUNS_DIR / run_id).resolve()
    if not str(run_dir).startswith(str(_RUNS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid run_id")
    return get_run_status(run_id, run_dir)


@app.get("/api/runs/{run_id}/report", response_class=HTMLResponse)
def get_run_report(run_id: str):
    """Serve report.html for a completed run."""
    run_dir = (_RUNS_DIR / run_id).resolve()
    if not str(run_dir).startswith(str(_RUNS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid run_id")
    report_path = run_dir / "report.html"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="report.html not found for this run")
    return HTMLResponse(report_path.read_text(encoding="utf-8", errors="replace"))


@app.get("/api/runs/{run_id}/timeline", response_class=HTMLResponse)
def get_run_timeline(run_id: str):
    """Serve timeline.html for a completed run."""
    run_dir = (_RUNS_DIR / run_id).resolve()
    if not str(run_dir).startswith(str(_RUNS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid run_id")
    timeline_path = run_dir / "timeline.html"
    if not timeline_path.exists():
        raise HTTPException(status_code=404, detail="timeline.html not found for this run")
    return HTMLResponse(timeline_path.read_text(encoding="utf-8", errors="replace"))


@app.get("/api/runs/{run_id}", response_model=WorkflowGraph)
def get_run_graph(run_id: str):
    """Parse dag.dot and trace.txt for a completed run and return graph JSON."""
    run_dir = (_RUNS_DIR / run_id).resolve()
    if not str(run_dir).startswith(str(_RUNS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid run_id")

    dag_path = run_dir / "dag.dot"
    if not dag_path.exists():
        raise HTTPException(status_code=404, detail=f"dag.dot not found for run {run_id!r}")

    status_map: dict[str, dict] | None = None
    trace_path = run_dir / "trace.txt"
    if trace_path.exists():
        status_map = parse_trace_content(trace_path.read_text())

    return _build_graph(parse_dag(str(dag_path)), status_map, work_base=_PROJECT_ROOT / "work")


@app.post("/api/runs/nf-core-demo-test")
def trigger_nf_core_demo():
    """Run nf-core/demo with the test profile and return run artefact paths."""
    return run_nf_core_demo()


@app.post("/api/runs/nf-core-rnaseq-test")
def trigger_nf_core_rnaseq():
    """Run nf-core/rnaseq with the test profile and return run artefact paths."""
    return run_nf_core_rnaseq()


@app.post("/graph/upload", response_model=WorkflowGraph)
async def graph_upload(
    file: UploadFile = File(...),
    trace: Optional[UploadFile] = File(None),
):
    """Accept a dag.dot (required) and trace.txt (optional) and return graph JSON."""
    dag_bytes = await file.read()
    try:
        dag_text = dag_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="dag.dot must be UTF-8 encoded text")

    parsed = parse_dag_content(dag_text)
    if not parsed["nodes"]:
        raise HTTPException(status_code=422, detail="No nodes found — is this a valid dag.dot file?")

    status_map: dict[str, dict] | None = None
    if trace is not None:
        trace_bytes = await trace.read()
        try:
            trace_text = trace_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="trace.txt must be UTF-8 encoded text")
        status_map = parse_trace_content(trace_text)

    return _build_graph(parsed, status_map)
