"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import DottedMap from "dotted-map";

import "./WorldMap.css";

/**
 * Adapted from Aceternity UI World Map for this existing Vite app.
 * Source: https://ui.aceternity.com/components/world-map
 * Registry: https://ui.aceternity.com/registry/world-map.json
 */
type MapPoint = { lat: number; lng: number; label?: string };

interface MapProps {
  dots?: Array<{ start: MapPoint; end: MapPoint }>;
  lineColor?: string;
}

export default function WorldMap({
  dots = [],
  lineColor = "#0ea5e9",
}: MapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const map = new DottedMap({ height: 100, grid: "diagonal" });
  const svgMap = map.getSVG({
    radius: 0.22,
    color: "#365f7d55",
    shape: "circle",
    backgroundColor: "transparent",
  });

  const projectPoint = (lat: number, lng: number) => ({
    x: (lng + 180) * (800 / 360),
    y: (90 - lat) * (400 / 180),
  });

  const createCurvedPath = (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  return (
    <div className="aceternity-world-map">
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="aceternity-world-map__image"
        alt=""
        aria-hidden="true"
        height="495"
        width="1056"
        draggable={false}
      />
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        className="aceternity-world-map__routes"
        aria-hidden="true"
      >
        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <motion.path
              key={`route-${i}`}
              d={createCurvedPath(startPoint, endPoint)}
              fill="none"
              stroke="url(#outreach-path-gradient)"
              strokeWidth="1"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, delay: 0.5 * i, ease: "easeOut" }}
            />
          );
        })}

        <defs>
          <linearGradient id="outreach-path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="95%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {dots.flatMap((dot, i) =>
          ([
            ["start", dot.start],
            ["end", dot.end],
          ] as const).map(([kind, point]) => {
            const projected = projectPoint(point.lat, point.lng);
            return (
              <g key={`${kind}-${i}`}>
                <circle cx={projected.x} cy={projected.y} r="2" fill={lineColor} />
                <circle cx={projected.x} cy={projected.y} r="2" fill={lineColor} opacity="0.5">
                  <animate attributeName="r" from="2" to="8" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
