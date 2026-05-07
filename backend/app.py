import json
import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from models import WorkflowGraph, WorkflowNode, WorkflowEdge, TaskRecord
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
_BUNDLE_DIR = Path(os.getenv("BUNDLE_DIR", "/app/bundle"))
_FILE_LIMIT = 200 * 1024  # 200 KB


def _bundle_work_base() -> Path | None:
    """Return the work directory inside the mounted bundle, if available."""
    for sub in ("work_dir", "work"):
        candidate = _BUNDLE_DIR / sub
        if candidate.is_dir():
            return candidate
    return None

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


def _extract_sample_label(name: str) -> str | None:
    """Extract sample ID from a Nextflow task name like 'PROCESS (sample_id)'."""
    if " (" in name and name.endswith(")"):
        label = name.split(" (", 1)[1][:-1].strip()
        return label or None
    return None


def _build_graph(
    parsed: dict,
    status_map: dict[str, list[dict]] | None = None,
    work_base: Path | None = None,
) -> WorkflowGraph:
    normalised: dict[str, list[dict]] = (
        {_normalise(k): v for k, v in status_map.items()} if status_map else {}
    )

    nodes = []
    for n in parsed["nodes"]:
        rows: list[dict] = normalised.get(_normalise(n["raw_label"])) or []

        # Aggregate counts across every task execution for this process
        n_completed = sum(1 for r in rows if r.get("status") in ("COMPLETED", "CACHED"))
        n_failed    = sum(1 for r in rows if r.get("status") == "FAILED")
        n_running   = sum(1 for r in rows if r.get("status") == "RUNNING")
        n_unknown   = len(rows) - n_completed - n_failed - n_running
        total       = len(rows)

        # Derive aggregate status from counts
        if total == 0:
            agg_status: str | None = None
        elif n_failed > 0:
            agg_status = "FAILED"
        elif n_running > 0:
            agg_status = "RUNNING"
        elif n_completed == total:
            agg_status = "COMPLETED"
        else:
            agg_status = "UNKNOWN"

        # Pick a representative record for file path resolution:
        # prefer first FAILED row (most useful for debugging), else first available.
        failed_rows = [r for r in rows if r.get("status") == "FAILED"]
        rec: dict = failed_rows[0] if failed_rows else (rows[0] if rows else {})

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

        # Build per-task records for drilldown (paths resolved per-row when work_base available)
        task_records: list[TaskRecord] = []
        for row in rows:
            r_hash = row.get("hash")
            r_work_dir = r_cmd = r_stdout = r_stderr = None
            if r_hash and work_base is not None:
                r_resolved = _resolve_work_dir(work_base, r_hash)
                r_work_dir = str(r_resolved)
                r_cmd      = r_work_dir + "/.command.sh"
                r_stdout   = r_work_dir + "/.command.out"
                r_stderr   = r_work_dir + "/.command.err"
            r_exit: int | None = None
            if row.get("exit"):
                try:
                    r_exit = int(row["exit"])
                except ValueError:
                    pass
            task_records.append(TaskRecord(
                task_id=row.get("task_id"),
                hash=r_hash,
                native_id=row.get("native_id"),
                sampleLabel=_extract_sample_label(row.get("name", "")),
                status=row.get("status"),
                exitCode=r_exit,
                duration=row.get("duration"),
                workDir=r_work_dir,
                commandPath=r_cmd,
                stdoutPath=r_stdout,
                stderrPath=r_stderr,
            ))

        nodes.append(WorkflowNode(
            id=n["id"],
            label=n["label"],
            status=agg_status,
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
            taskCount=total if total > 0 else None,
            completedCount=n_completed if total > 0 else None,
            failedCount=n_failed if total > 0 else None,
            runningCount=n_running if total > 0 else None,
            unknownCount=n_unknown if total > 0 else None,
            tasks=task_records if task_records else None,
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

    allowed = [str(_WORK_DIR.resolve())]
    wb = _bundle_work_base()
    if wb is not None:
        allowed.append(str(wb.resolve()))
    if not any(str(resolved).startswith(p) for p in allowed):
        raise HTTPException(status_code=403, detail="Access denied: path is outside allowed directories")

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


@app.get("/api/bundle/status")
def bundle_status():
    """Report whether a debug bundle is mounted and which artefacts are present."""
    available = _BUNDLE_DIR.is_dir()
    return {
        "available":  available,
        "dag":        (_BUNDLE_DIR / "dag.dot").exists()       if available else False,
        "trace":      (_BUNDLE_DIR / "trace.txt").exists()     if available else False,
        "report":     (_BUNDLE_DIR / "report.html").exists()   if available else False,
        "timeline":   (_BUNDLE_DIR / "timeline.html").exists() if available else False,
    }


@app.get("/api/bundle/graph", response_model=WorkflowGraph)
def bundle_graph():
    """Parse dag.dot and trace.txt from the mounted bundle and return graph JSON."""
    dag_path = _BUNDLE_DIR / "dag.dot"
    if not dag_path.exists():
        raise HTTPException(status_code=404, detail="No dag.dot found in bundle")
    status_map: dict[str, list[dict]] | None = None
    trace_path = _BUNDLE_DIR / "trace.txt"
    if trace_path.exists():
        status_map = parse_trace_content(trace_path.read_text())
    return _build_graph(parse_dag(str(dag_path)), status_map, work_base=_bundle_work_base())


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


_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="static")
