"""Start a Nextflow run in a background thread and track its status."""

import subprocess
import threading
import uuid
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# run_id -> {"status": "running"|"completed"|"failed", "return_code": int|None}
# Module-level so state survives across requests within a single server process.
_ACTIVE_RUNS: dict[str, dict] = {}


def run_nf_core_demo() -> dict:
    """Start nf-core/demo in a background thread and return the run_id immediately."""
    run_id = uuid.uuid4().hex[:12]
    run_dir = _PROJECT_ROOT / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    dag_path      = run_dir / "dag.dot"
    trace_path    = run_dir / "trace.txt"
    report_path   = run_dir / "report.html"
    timeline_path = run_dir / "timeline.html"
    results_dir   = run_dir / "results"
    stdout_path   = run_dir / "stdout.txt"
    stderr_path   = run_dir / "stderr.txt"

    command = [
        "nextflow", "run", "nf-core/demo",
        "-profile", "test,docker",
        "--outdir", str(results_dir),
        "-with-dag", str(dag_path),
        "-with-trace", str(trace_path),
        "-with-report", str(report_path),
        "-with-timeline", str(timeline_path),
        "-ansi-log", "false",
    ]

    _ACTIVE_RUNS[run_id] = {"status": "running", "return_code": None}

    def _execute() -> None:
        try:
            proc = subprocess.run(
                command,
                cwd=str(_PROJECT_ROOT),
                capture_output=True,
                text=True,
            )
            stdout_path.write_text(proc.stdout)
            stderr_path.write_text(proc.stderr)
            _ACTIVE_RUNS[run_id]["return_code"] = proc.returncode
            _ACTIVE_RUNS[run_id]["status"] = "completed" if proc.returncode == 0 else "failed"
        except FileNotFoundError:
            stdout_path.write_text("")
            stderr_path.write_text(
                "nextflow executable not found — is Nextflow installed and on PATH?"
            )
            _ACTIVE_RUNS[run_id]["return_code"] = -1
            _ACTIVE_RUNS[run_id]["status"] = "failed"

    threading.Thread(target=_execute, daemon=True).start()

    return {
        "run_id":  run_id,
        "status":  "running",
        "run_dir": str(run_dir),
        "command": " ".join(command),
    }


def get_run_status(run_id: str, run_dir: Path) -> dict:
    """Return status and artefact availability for a run.

    If the server was restarted after the run was launched, _ACTIVE_RUNS won't
    have an entry. In that case we infer from the filesystem: dag.dot existing
    means the run completed; absence means we treat it as still running.
    """
    dag_available   = (run_dir / "dag.dot").exists()
    trace_available = (run_dir / "trace.txt").exists()

    record = _ACTIVE_RUNS.get(run_id)
    if record:
        status = record["status"]
    elif dag_available:
        status = "completed"
    else:
        status = "running"

    return {
        "run_id":          run_id,
        "status":          status,
        "dag_available":   dag_available,
        "trace_available": trace_available,
    }
