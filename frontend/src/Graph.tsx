import { useEffect, useRef, ReactNode } from "react";
import * as d3 from "d3";
import dagre from "dagre";
import { WorkflowNode, WorkflowEdge } from "./types";

const NODE_R = 22;
const NODE_R_HOVER = 28;

const STATUS_COLOUR: Record<string, string> = {
  COMPLETED: "#22c55e",
  FAILED: "#ef4444",
  CACHED: "#3b82f6",
  SKIPPED: "#9ca3af",
  UNKNOWN: "#9ca3af",
  RUNNING: "#f59e0b",
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

// ---- DAG layout via dagre (left-to-right, minimises edge crossings) ---------
function computeDagreLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  width: number,
  height: number,
): LayoutNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", align: "UL", ranksep: 150, nodesep: 55, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  // Extra height budget so dagre reserves space for the label below each circle
  for (const n of nodes) g.setNode(n.id, { width: NODE_R * 2, height: NODE_R * 2 + 22 });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  // Offset positions so the graph bbox is centred in the SVG viewport
  const gw = g.graph().width  ?? 0;
  const gh = g.graph().height ?? 0;
  const ox = (width  - gw) / 2;
  const oy = (height - gh) / 2;

  const base = nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, x: (pos?.x ?? 0) + ox, y: (pos?.y ?? 0) + oy };
  });

  // ── Diagonal drift: nodes further right sit slightly lower, giving a
  //    top-left → bottom-right reading direction without distorting the layout.
  const xs     = base.map((n) => n.x);
  const xMin   = Math.min(...xs);
  const xRange = (Math.max(...xs) - xMin) || 1;
  const DRIFT  = 35;  // max extra y-offset at the rightmost rank (px)
  const BIAS   = 18;  // nudge for known start / end nodes (px)

  const isStart = (l: string) => l === "Input" || /fromFilePairs/i.test(l);
  const isEnd   = (l: string) => /MULTIQC|REPORT|OUTPUT|TIMELINE/i.test(l);

  return base.map((n) => {
    const xFrac = (n.x - xMin) / xRange;
    let dx = 0;
    let dy = xFrac * DRIFT;
    if (isStart(n.label)) { dx -= BIAS; dy -= BIAS; }
    if (isEnd(n.label))   { dx += BIAS; dy += BIAS; }
    return { ...n, x: n.x + dx, y: n.y + dy };
  });
}
// ---- End DAG layout ---------------------------------------------------------

// ---- Force-directed layout (pre-warmed, static result) ----------------------
function computeForceLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  width: number,
  height: number,
): LayoutNode[] {
  type FNode = WorkflowNode & d3.SimulationNodeDatum;
  // Seed on a circle so the simulation converges cleanly
  const simNodes: FNode[] = nodes.map((n, i) => ({
    ...n,
    x: width  / 2 + Math.cos((2 * Math.PI * i) / nodes.length) * 120,
    y: height / 2 + Math.sin((2 * Math.PI * i) / nodes.length) * 120,
  }));

  const links = edges
    .filter((e) => simNodes.some((n) => n.id === e.source) && simNodes.some((n) => n.id === e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const sim = d3.forceSimulation(simNodes)
    .force("link",    d3.forceLink(links).id((d) => (d as FNode).id).distance(150).strength(0.8))
    .force("charge",  d3.forceManyBody().strength(-400))
    .force("center",  d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(NODE_R + 10))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

  return simNodes.map((n) => ({ ...n, x: n.x ?? width / 2, y: n.y ?? height / 2 }));
}
// ---- End force layout -------------------------------------------------------

// ---- Failure-path traversal -------------------------------------------------
function getAncestors(nodeId: string, edges: WorkflowEdge[]): Set<string> {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (!parents.has(e.target)) parents.set(e.target, []);
    parents.get(e.target)!.push(e.source);
  }
  const result = new Set<string>();
  const queue = [...(parents.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(parents.get(id) ?? []));
  }
  return result;
}

function getDescendants(nodeId: string, edges: WorkflowEdge[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source)!.push(e.target);
  }
  const result = new Set<string>();
  const queue = [...(children.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}
// ---- End failure-path traversal ---------------------------------------------

// Take the last colon-separated segment of nf-core qualified names (e.g.
// "NFCORE_RNASEQ:RNASEQ:PREPARE_GENOME:GUNZIP_GTF" → "GUNZIP_GTF").
// Falls back to the full label, then truncates to 20 chars to prevent overlap.
function displayLabel(label: string): string {
  const parts = label.split(":");
  const name = (parts[parts.length - 1].trim()) || label;
  return name.length > 20 ? name.slice(0, 19) + "…" : name;
}

type Props = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedId: string | null;
  onSelect: (node: WorkflowNode) => void;
  onDeselect: () => void;
  processOnly: boolean;
  centreKey: number;
  layout: "force" | "dag";
  statusBanner?: ReactNode;
};

export default function Graph({ nodes, edges, selectedId, onSelect, onDeselect, processOnly, centreKey, layout, statusBanner }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lastCentreKeyRef = useRef(0);
  // Tracks previous node statuses to detect changes between renders for ripple animation
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    // Detect which nodes changed status since the last render
    const changedIds = new Set<string>();
    for (const n of nodes) {
      const prev = prevStatusRef.current.get(n.id);
      if (prev !== undefined && prev !== (n.status ?? "UNKNOWN")) {
        changedIds.add(n.id);
      }
    }
    prevStatusRef.current = new Map(nodes.map((n) => [n.id, n.status ?? "UNKNOWN"]));

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
    const layoutNodes = layout === "force"
      ? computeForceLayout(visibleNodes, visibleEdges, width, height)
      : computeDagreLayout(visibleNodes, visibleEdges, width, height);
    const nodeById = new Map(layoutNodes.map((n) => [n.id, n]));

    // ── Failure-path sets ─────────────────────────────────────────────────────
    const selectedNode = selectedId ? nodeById.get(selectedId) : null;
    const isFailed     = selectedNode?.status === "FAILED";

    const upstreamIds = isFailed && selectedId
      ? getAncestors(selectedId, visibleEdges)
      : new Set<string>();

    const downstreamIds = isFailed && selectedId
      ? getDescendants(selectedId, visibleEdges)
      : selectedId
        ? new Set(visibleEdges.filter((e) => e.source === selectedId).map((e) => e.target))
        : new Set<string>();

    // Edges where both endpoints are on the failure path
    const pathNodeIds  = isFailed && selectedId
      ? new Set([...upstreamIds, selectedId, ...downstreamIds])
      : new Set<string>();
    const pathEdgeKeys = new Set(
      visibleEdges
        .filter((e) => pathNodeIds.has(e.source) && pathNodeIds.has(e.target))
        .map((e) => `${e.source}->${e.target}`),
    );
    // ─────────────────────────────────────────────────────────────────────────

    const layoutLinks: LayoutLink[] = visibleEdges
      .map((e) => ({ source: nodeById.get(e.source)!, target: nodeById.get(e.target)! }))
      .filter((l) => l.source && l.target);

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    svg.call(zoom);
    svg.on("click", () => onDeselect());

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
      .attr("fill", "#374151");

    g.append("g")
      .selectAll("line")
      .data(layoutLinks)
      .join("line")
      .attr("stroke", (d) =>
        isFailed && pathEdgeKeys.has(`${d.source.id}->${d.target.id}`) ? "#64748b" : "#374151")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", (d) => {
        if (!isFailed) return 0.25;
        return pathEdgeKeys.has(`${d.source.id}->${d.target.id}`) ? 0.65 : 0.06;
      })
      .attr("marker-end", "url(#arrow)")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    const nodeRole = (d: LayoutNode) => {
      if (d.id === selectedId)              return "selected";
      if (!selectedId)                       return "normal";
      if (isFailed && upstreamIds.has(d.id)) return "upstream";
      if (downstreamIds.has(d.id))           return "downstream";
      return "dimmed";
    };

    const nodeGroup = g
      .append("g")
      .selectAll("g")
      .data(layoutNodes)
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .style("opacity", (d) => {
        const role = nodeRole(d);
        if (role === "dimmed")     return isFailed ? 0.1 : 0.25;
        if (role === "upstream")   return 0.8;
        if (role === "downstream") return isFailed ? 0.75 : 1;
        return 1;
      })
      .on("click", (event, d) => { event.stopPropagation(); onSelect(d); })
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
        if (role === "selected")   return "#f8fafc";
        if (role === "upstream")   return "#fbbf24";
        if (role === "downstream") return isFailed ? "#f97316" : "#f59e0b";
        return "transparent";
      })
      .attr("stroke-width", (d) => {
        const role = nodeRole(d);
        if (role === "selected") return 3;
        if ((role === "upstream" || role === "downstream") && isFailed) return 1.5;
        if (role === "downstream" && !isFailed) return 3;
        return 0;
      })
      .style("filter", (d) => {
        const role = nodeRole(d);
        if (role === "selected") return isFailed
          ? "drop-shadow(0 0 8px #ef444488)"
          : "drop-shadow(0 0 6px #f8fafc88)";
        if (role === "downstream" && !isFailed) return "drop-shadow(0 0 6px #f59e0b88)";
        return "none";
      });

    nodeGroup
      .append("text")
      .text((d) => displayLabel(d.label))
      .attr("text-anchor", "middle")
      .attr("dy", 36)
      .attr("fill", "#e2e8f0")
      .attr("font-size", 10)
      .attr("font-family", "system-ui, sans-serif")
      .style("pointer-events", "none");

    // Task count badge for process nodes (taskCount only present in Process view)
    nodeGroup
      .filter((d) => d.taskCount !== undefined)
      .append("text")
      .text((d) => {
        const done   = d.completedCount ?? 0;
        const total  = d.taskCount!;
        const failed = d.failedCount    ?? 0;
        return failed > 0 ? `${done}/${total} · ${failed} failed` : `${done}/${total}`;
      })
      .attr("text-anchor", "middle")
      .attr("dy", 48)
      .attr("fill", (d) => (d.failedCount ?? 0) > 0 ? "#ef4444" : "#94a3b8")
      .attr("font-size", 12)
      .attr("font-weight", 500)
      .attr("font-family", "system-ui, sans-serif")
      .style("pointer-events", "none");

    // Ripple ring on nodes whose status changed since the last render
    if (changedIds.size > 0) {
      nodeGroup
        .filter((d) => changedIds.has(d.id))
        .append("circle")
        .attr("r", NODE_R)
        .attr("fill", "none")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1.5)
        .style("opacity", "0.75")
        .attr("pointer-events", "none")
        .transition()
        .duration(700)
        .ease(d3.easeQuadOut)
        .attr("r", NODE_R + 20)
        .style("opacity", "0")
        .remove();
    }

    return () => { tooltip.remove(); };
  }, [nodes, edges, selectedId, onSelect, onDeselect, processOnly, centreKey, layout]);

  const legend = [
    { colour: "#22c55e", label: "Completed" },
    { colour: "#ef4444", label: "Failed" },
    { colour: "#f59e0b", label: "Running" },
    { colour: "#9ca3af", label: "Unknown" },
  ];

  const selectedNodeFailed =
    !!selectedId && nodes.find((n) => n.id === selectedId)?.status === "FAILED";

  return (
    <div style={{ flex: 1, position: "relative", background: "#0f1117" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {statusBanner && (
        <div style={{
          position: "absolute",
          top: 12,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 5,
        }}>
          {statusBanner}
        </div>
      )}
      {selectedNodeFailed && (
        <div style={{
          position: "absolute", bottom: 100, left: 0, right: 0,
          display: "flex", justifyContent: "center",
          pointerEvents: "none", zIndex: 4,
        }}>
          <div style={{
            fontSize: 11, color: "#94a3b8",
            background: "rgba(15,17,23,0.85)", border: "1px solid #2d3148",
            borderRadius: 10, padding: "4px 12px",
          }}>
            Failure path: upstream inputs and downstream affected steps highlighted
          </div>
        </div>
      )}

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
