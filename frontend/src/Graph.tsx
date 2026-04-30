import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { WorkflowNode, WorkflowEdge } from "./types";

const NODE_R = 22;
const NODE_R_HOVER = 28;

const STATUS_COLOUR: Record<string, string> = {
  COMPLETED: "#22c55e",
  FAILED: "#ef4444",
  CACHED: "#3b82f6",
  SKIPPED: "#9ca3af",
  UNKNOWN: "#9ca3af",
};

type SimNode = d3.SimulationNodeDatum & WorkflowNode;
type SimLink = d3.SimulationLinkDatum<SimNode> & { source: SimNode; target: SimNode };

type Props = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedId: string | null;
  onSelect: (node: WorkflowNode) => void;
};

export default function Graph({ nodes, edges, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    // Tooltip div — appended to body so it escapes SVG clipping
    const tooltip = d3.select("body")
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

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = edges
      .map((e) => ({
        source: nodeById.get(e.source)!,
        target: nodeById.get(e.target)!,
      }))
      .filter((l) => l.source && l.target) as SimLink[];

    const g = svg.append("g");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
    );

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

    const link = g
      .append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    const downstreamIds = selectedId
      ? new Set(edges.filter((e) => e.source === selectedId).map((e) => e.target))
      : new Set<string>();

    const nodeRole = (d: SimNode) => {
      if (d.id === selectedId) return "selected";
      if (downstreamIds.has(d.id)) return "downstream";
      if (selectedId) return "dimmed";
      return "normal";
    };

    const nodeGroup = g
      .append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .style("cursor", "pointer")
      .style("opacity", (d) => nodeRole(d) === "dimmed" ? 0.25 : 1)
      .on("click", (_event, d) => onSelect(d))
      .on("mouseenter", function (_event, d) {
        d3.select(this).select("circle")
          .transition().duration(120)
          .attr("r", NODE_R_HOVER);
        tooltip.text(d.label).style("opacity", "1");
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", `${event.clientX + 14}px`)
          .style("top", `${event.clientY - 28}px`);
      })
      .on("mouseleave", function () {
        d3.select(this).select("circle")
          .transition().duration(120)
          .attr("r", NODE_R);
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

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as SimNode).x!)
          .attr("y1", (d) => (d.source as SimNode).y!)
          .attr("x2", (d) => (d.target as SimNode).x!)
          .attr("y2", (d) => (d.target as SimNode).y!);

        nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [nodes, edges, selectedId, onSelect]);

  return (
    <svg
      ref={svgRef}
      style={{ flex: 1, display: "block", background: "#0f1117" }}
    />
  );
}
