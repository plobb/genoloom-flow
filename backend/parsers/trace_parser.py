"""Parse a Nextflow trace.txt file into a process -> list[trace_record] mapping."""

# Statuses that indicate a task has a known outcome and should be counted
_COUNTED_STATUSES = {"COMPLETED", "FAILED", "CACHED", "RUNNING"}

# Trace column header -> internal record key
_COLUMN_MAP = {
    "task_id":   "task_id",
    "hash":      "hash",
    "native_id": "native_id",
    "status":    "status",
    "exit":      "exit",
    "submit":    "submit",
    "duration":  "duration",
    "realtime":  "realtime",
    "%cpu":      "cpu_pct",
    "peak_rss":  "peak_rss",
    "peak_vmem": "peak_vmem",
    "rchar":     "rchar",
    "wchar":     "wchar",
}


def parse_trace_content(text: str) -> dict[str, list[dict]]:
    """Return {process_name: [trace_records]} for all recognised task statuses.

    All rows for a process are retained so the caller can aggregate counts.
    """
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

    # Build index map for every column we care about
    col_indices: dict[str, int] = {
        key: headers.index(header)
        for header, key in _COLUMN_MAP.items()
        if header in headers
    }

    result: dict[str, list[dict]] = {}

    for line in lines[1:]:
        if not line.strip():
            continue
        cols = line.split("\t")

        raw_status = cols[status_idx].strip() if status_idx < len(cols) else ""
        if raw_status not in _COUNTED_STATUSES:
            continue

        if process_idx is not None:
            process = cols[process_idx].strip() if process_idx < len(cols) else ""
        else:
            name = cols[name_idx].strip() if name_idx < len(cols) else ""  # type: ignore[index]
            process = name.split(" (")[0].strip()

        if not process:
            continue

        record: dict[str, str] = {}
        for key, idx in col_indices.items():
            if idx < len(cols):
                val = cols[idx].strip()
                if val and val != "-":
                    record[key] = val

        result.setdefault(process, []).append(record)

    return result
