"""Parse a Nextflow dag.dot file into nodes and edges."""

import re
from typing import TypedDict

# Matches:  p0 [label="FASTQC\n(fastqc)"]
# Captures: node_id, raw label text
_NODE_RE = re.compile(r'^\s*(\w+)\s*\[.*?label="([^"]+)"')

# Matches:  p0 -> p1   or   p0 -> p1 [label="..."]
# Captures: source_id, target_id
_EDGE_RE = re.compile(r'^\s*(\w+)\s*->\s*(\w+)')


class NodeDict(TypedDict):
    id: str
    label: str


class EdgeDict(TypedDict):
    source: str
    target: str


def parse_dag(dot_path: str) -> dict:
    nodes: list[NodeDict] = []
    edges: list[EdgeDict] = []
    seen: set[str] = set()

    with open(dot_path) as fh:
        for line in fh:
            node_match = _NODE_RE.match(line)
            if node_match:
                node_id, raw_label = node_match.group(1), node_match.group(2)
                if node_id not in seen:
                    seen.add(node_id)
                    # Take the first line of a multi-line label as the display label
                    label = raw_label.split("\\n")[0].strip()
                    nodes.append({"id": node_id, "label": label})
                continue

            edge_match = _EDGE_RE.match(line)
            if edge_match:
                edges.append({"source": edge_match.group(1), "target": edge_match.group(2)})

    return {"nodes": nodes, "edges": edges}
