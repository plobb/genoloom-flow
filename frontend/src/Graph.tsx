import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { WorkflowNode, WorkflowEdge } from "./types";

const NODE_R = 22;
const NODE_R_HOVER = 28;
const H_SPACING = 200;
const V_SPACING = 100;

const STATUS_COLOUR: Record<string, string> = {
  COMPLETED: "#22c55e",
  FAILED: "#ef4444",
  CACHED: "#3b82f6",
  SKIPPED: "#9ca3af",
  UNKNOWN: "#9ca3af",
};

type LayoutNode = WorkflowNode & { x: number; y: number };
type LayoutLink = { source: LayoutNode; target: LayoutNode };

// ---- Process-only filter ----------------------------------------------------
// In process-only mode, only nodes enriched from trace.txt (i.e. node.status is
// set) are considered real tasks. Every other node — channels, operators, unmatched
// processes — is hidden. Edges are rewritten so that if A reaches B through hidden
// intermediaries, a direct A → B edge is shown instead.
function filterGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  processOnly: boolean,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  if (!processOnly) return { nodes, edges };

  const visibleIds = new Set(nodes.filter((n) => n.status).map((n) => n.id));
  const hiddenIds  = new Set(nodes.filter((n) => !visibleIds.has(n.id)).map((n) => n.id));

  // Full adjacency list (including hidden nodes) for traversal
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) adj.get(e.source)?.push(e.target);

  // BFS from each visible source through hidden intermediaries
  const resultEdges: WorkflowEdge[] = [];
  const seen = new Set<string>();

  for (const sourceId of visibleIds) {
    const queue = [...(adj.get(sourceId) ?? [])];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);

      if (curr !== sourceId && visibleIds.has(curr)) {
        const key = `${sourceId}->${curr}`;
        if (!seen.has(key)) {
          seen.add(key);
          resultEdges.push({ source: sourceId, target: curr });
        }
      } else if (hiddenIds.has(curr)) {
        queue.push(...(adj.get(curr) ?? []));
      }
    }
  }

  return { nodes: nodes.filter((n) => visibleIds.has(n.id)), edges: resultEdges };
}
// ---- End process-only filter ------------------------------------------------

// ---- Layered DAG layout (left-to-right, deterministic) ----------------------
// To revert to force layout: replace computeLayeredLayout with d3.forceSimulation,
// wire up a tick handler, and change LayoutNode back to SimulationNodeDatum.
function computeLayeredLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  width: number,
  height: number,
): LayoutNode[] {
  // Build adjacency and in-degree maps
  const children = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  for (const e of edges) {
    children.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  // Kahn's topological sort — propagate max depth to each child
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const remaining = new Map(inDegree);
  const queue: string[] = nodes
    .filter((n) => inDegree.get(n.id) === 0)
    .map((n) => n.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of children.get(id) ?? []) {
      const candidate = depth.get(id)! + 1;
      if (candidate > depth.get(child)!) depth.set(child, candidate);
      remaining.set(child, remaining.get(child)! - 1);
      if (remaining.get(child) === 0) queue.push(child);
    }
  }

  // Group node ids by depth (column)
  const layers = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(id);
  }

  // Assign x/y — columns spread left-to-right, rows centred vertically
  const posById = new Map<string, { x: number; y: number }>();
  const leftPad = 60;

  for (const [d, ids] of layers) {
    const x = leftPad + d * H_SPACING;
    const colHeight = (ids.length - 1) * V_SPACING;
    const top = height / 2 - colHeight / 2;
    ids.forEach((id, i) => posById.set(id, { x, y: top + i * V_SPACING }));
  }

  return nodes.map((n) => ({ ...n, ...posById.get(n.id)! }));
}
// ---- End layered layout -----------------------------------------------------

type Props = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedId: string | null;
  onSelect: (node: WorkflowNode) => void;
  processOnly: boolean;
  centreKey: number;
};

export default function Graph({ nodes, edges, selectedId, onSelect, processOnly, centreKey }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lastCentreKeyRef = useRef(0);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    // Tooltip div — appended to body so it escapes SVG clipping
    const tooltip = d3
      .select("body")
      .append("div")
      .style("position", "fixed")
      .style("pointer-events", "none")
      .style("background", "#1e2130")
      .style("color", "#e2e8f0")
      .style("border", "1px solid #3d4468")
      .style("border-radius", "6px")
      .style("padding", "5px 10px")
      .style("font-size", "12px")
      .style("white-space", "nowrap")
      .style("opacity", "0")
      .style("transition", "opacity 0.1s")
      .style("z-index", "9999");

    const { nodes: visibleNodes, edges: visibleEdges } = filterGraph(nodes, edges, processOnly);
    const layoutNodes = computeLayeredLayout(visibleNodes, visibleEdges, width, height);
    const nodeById = new Map(layoutNodes.map((n) => [n.id, n]));

    const layoutLinks: LayoutLink[] = visibleEdges
      .map((e) => ({ source: nodeById.get(e.source)!, target: nodeById.get(e.target)! }))
      .filter((l) => l.source && l.target);

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    svg.call(zoom);

    // Centre on the selected node when a programmatic jump triggers a new centreKey
    const shouldCentre = centreKey > lastCentreKeyRef.current;
    if (shouldCentre) {
      lastCentreKeyRef.current = centreKey;
      if (selectedId) {
        const target = nodeById.get(selectedId);
        if (target) {
          const tx = width / 2 - target.x;
          const ty = height / 2 - target.y;
          svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty));
        }
      }
    }

    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", NODE_R + 6)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#4b5563");

    g.append("g")
      .selectAll("line")
      .data(layoutLinks)
      .join("line")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    const downstreamIds = selectedId
      ? new Set(visibleEdges.filter((e) => e.source === selectedId).map((e) => e.target))
      : new Set<string>();

    const nodeRole = (d: LayoutNode) => {
      if (d.id === selectedId) return "selected";
      if (downstreamIds.has(d.id)) return "downstream";
      if (selectedId) return "dimmed";
      return "normal";
    };

    const nodeGroup = g
      .append("g")
      .selectAll("g")
      .data(layoutNodes)
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .style("opacity", (d) => (nodeRole(d) === "dimmed" ? 0.25 : 1))
      .on("click", (_event, d) => onSelect(d))
      .on("mouseenter", function (_event, d) {
        d3.select(this).select("circle").transition().duration(120).attr("r", NODE_R_HOVER);
        tooltip.text(d.label).style("opacity", "1");
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", `${event.clientX + 14}px`)
          .style("top", `${event.clientY - 28}px`);
      })
      .on("mouseleave", function () {
        d3.select(this).select("circle").transition().duration(120).attr("r", NODE_R);
        tooltip.style("opacity", "0");
      });

    nodeGroup
      .append("circle")
      .attr("r", NODE_R)
      .attr("fill", (d) => STATUS_COLOUR[d.status ?? "UNKNOWN"])
      .attr("stroke", (d) => {
        const role = nodeRole(d);
        if (role === "selected") return "#f8fafc";
        if (role === "downstream") return "#f59e0b";
        return "transparent";
      })
      .attr("stroke-width", 3)
      .style("filter", (d) => {
        const role = nodeRole(d);
        if (role === "selected") return "drop-shadow(0 0 6px #f8fafc88)";
        if (role === "downstream") return "drop-shadow(0 0 6px #f59e0b88)";
        return "none";
      });

    nodeGroup
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", 36)
      .attr("fill", "#e2e8f0")
      .attr("font-size", 11)
      .attr("font-family", "system-ui, sans-serif")
      .style("pointer-events", "none");

    return () => { tooltip.remove(); };
  }, [nodes, edges, selectedId, onSelect, processOnly, centreKey]);

  const legend = [
    { colour: "#22c55e", label: "Completed" },
    { colour: "#ef4444", label: "Failed" },
    { colour: "#9ca3af", label: "Unknown" },
  ];

  return (
    <div style={{ flex: 1, position: "relative", background: "#0f1117" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          background: "rgba(15,17,23,0.75)",
          border: "1px solid #2d3148",
          borderRadius: 6,
          padding: "8px 12px",
          pointerEvents: "none",
        }}
      >
        {legend.map(({ colour, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: colour,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "#64748b", letterSpacing: 0.2 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
