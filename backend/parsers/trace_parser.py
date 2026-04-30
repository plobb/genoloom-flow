"""Parse a Nextflow trace.txt file into a process -> status mapping."""

# Status priority: higher index wins when multiple tasks share a process name
_PRIORITY = {"COMPLETED": 0, "FAILED": 1}


def parse_trace_content(text: str) -> dict[str, str]:
    """Return {process_name: worst_status} for COMPLETED/FAILED tasks."""
    lines = text.splitlines()
    if not lines:
        return {}

    headers = lines[0].split("\t")
    try:
        status_idx = headers.index("status")
    except ValueError:
        return {}

    # Prefer an explicit 'process' column; fall back to deriving from 'name'
    process_idx: int | None = None
    name_idx: int | None = None
    if "process" in headers:
        process_idx = headers.index("process")
    elif "name" in headers:
        name_idx = headers.index("name")
    else:
        return {}

    result: dict[str, str] = {}

    for line in lines[1:]:
        if not line.strip():
            continue
        cols = line.split("\t")

        raw_status = cols[status_idx].strip() if status_idx < len(cols) else ""
        if raw_status not in _PRIORITY:
            continue

        if process_idx is not None:
            process = cols[process_idx].strip() if process_idx < len(cols) else ""
        else:
            # e.g. "BWA_MEM (sample1)" -> "BWA_MEM"
            name = cols[name_idx].strip() if name_idx < len(cols) else ""  # type: ignore[index]
            process = name.split(" (")[0].strip()

        if not process:
            continue

        if _PRIORITY[raw_status] > _PRIORITY.get(result.get(process, "COMPLETED"), 0):
            result[process] = raw_status
        elif process not in result:
            result[process] = raw_status

    return result
