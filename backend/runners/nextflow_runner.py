"""Run nf-core/demo locally and return paths to all output artefacts."""

import subprocess
import uuid
from pathlib import Path

# backend/runners/nextflow_runner.py -> project root is two levels up
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def run_nf_core_demo() -> dict:
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

    status: str
    return_code: int

    try:
        proc = subprocess.run(
            command,
            cwd=str(_PROJECT_ROOT),
            capture_output=True,
            text=True,
        )
        stdout_path.write_text(proc.stdout)
        stderr_path.write_text(proc.stderr)
        return_code = proc.returncode
        status = "completed" if return_code == 0 else "failed"
    except FileNotFoundError:
        stdout_path.write_text("")
        stderr_path.write_text(
            "nextflow executable not found — is Nextflow installed and on PATH?"
        )
        return_code = -1
        status = "failed"

    return {
        "run_id":        run_id,
        "status":        status,
        "run_dir":       str(run_dir),
        "dag_path":      str(dag_path),
        "trace_path":    str(trace_path),
        "report_path":   str(report_path),
        "timeline_path": str(timeline_path),
        "stdout_path":   str(stdout_path),
        "stderr_path":   str(stderr_path),
        "return_code":   return_code,
        "command":       " ".join(command),
    }
