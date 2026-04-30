"""Parse a Nextflow dag.dot file into nodes and edges."""

import re
from typing import TypedDict

# Matches:  p0 [label="FASTQC\n(fastqc)"]
# Captures: node_id, raw label text
_NODE_RE = re.compile(r'^\s*(\w+)\s*\[.*?label="([^"]+)"')

# Matches:  p0 -> p1   or   p0 -> p1 [label="..."]
# Captures: source_id, target_id
_EDGE_RE = re.compile(r'^\s*(\w+)\s*->\s*(\w+)')


def _clean_label(raw: str) -> str:
    if raw.startswith("Channel."):
        raw = "Input " + raw[len("Channel."):]
    return raw.replace("_", " ")


class NodeDict(TypedDict):
    id: str
    label: str
    raw_label: str


class EdgeDict(TypedDict):
    source: str
    target: str


def parse_dag_content(content: str) -> dict:
    nodes: list[NodeDict] = []
    edges: list[EdgeDict] = []
    seen: set[str] = set()

    for line in content.splitlines():
        node_match = _NODE_RE.match(line)
        if node_match:
            node_id, raw_label = node_match.group(1), node_match.group(2)
            if node_id not in seen:
                seen.add(node_id)
                first_line = raw_label.split("\\n")[0].strip()
                label = _clean_label(first_line)
                nodes.append({"id": node_id, "label": label, "raw_label": first_line})
            continue

        edge_match = _EDGE_RE.match(line)
        if edge_match:
            edges.append({"source": edge_match.group(1), "target": edge_match.group(2)})

    return {"nodes": nodes, "edges": edges}


def parse_dag(dot_path: str) -> dict:
    with open(dot_path) as fh:
        return parse_dag_content(fh.read())
