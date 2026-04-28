import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { WorkflowNode, WorkflowEdge } from "./types";

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
      .attr("refX", 28)
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

    const nodeGroup = g
      .append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_event, d) => onSelect(d));

    nodeGroup
      .append("circle")
      .attr("r", 22)
      .attr("fill", (d) => STATUS_COLOUR[d.status ?? "UNKNOWN"])
      .attr("stroke", (d) => (d.id === selectedId ? "#f8fafc" : "transparent"))
      .attr("stroke-width", 3);

    nodeGroup
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", 36)
      .attr("fill", "#e2e8f0")
      .attr("font-size", 11)
      .attr("font-family", "system-ui, sans-serif");

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
    };
  }, [nodes, edges, selectedId, onSelect]);

  return (
    <svg
      ref={svgRef}
      style={{ flex: 1, display: "block", background: "#0f1117" }}
    />
  );
}
