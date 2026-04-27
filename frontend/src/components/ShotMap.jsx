import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export default function ShotMap({ events = [] }) {
  const svgRef = useRef(null);
  
  useEffect(() => {
    if (!svgRef.current) return;
    
    // Default pitch layout if events isn't fully defined yet
    const rawEvents = events || [];
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    const width = 420;
    const height = 272;
    
    // Draw pitch background
    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .style('background', '#2f855a'); // green-700
       
    // Draw lines
    const gLines = svg.append('g').attr('stroke', '#ffffff').attr('stroke-width', 2).attr('fill', 'none');
    
    // Outer boundary
    gLines.append('rect').attr('x', 0).attr('y', 0).attr('width', width).attr('height', height);
    // Halfway line
    gLines.append('line').attr('x1', width/2).attr('y1', 0).attr('x2', width/2).attr('y2', height);
    // Center circle
    gLines.append('circle').attr('cx', width/2).attr('cy', height/2).attr('r', 36);
    // Penalty areas
    gLines.append('rect').attr('x', 0).attr('y', height/2 - 80).attr('width', 66).attr('height', 160);
    gLines.append('rect').attr('x', width - 66).attr('y', height/2 - 80).attr('width', 66).attr('height', 160);
    // Goal areas
    gLines.append('rect').attr('x', 0).attr('y', height/2 - 36).attr('width', 22).attr('height', 72);
    gLines.append('rect').attr('x', width - 22).attr('y', height/2 - 36).attr('width', 22).attr('height', 72);
    
    // Map events
    const gPoints = svg.append('g');
    rawEvents.forEach(e => {
      // Scale from [0, 100] coordinates
      const cx = (e.x / 100) * width;
      const cy = (e.y / 100) * height;
      const r = Math.max(3, (e.xg_value || 0.1) * 15);
      const isGoal = e.outcome === 'Goal';
      
      gPoints.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', r)
        .attr('fill', isGoal ? '#10b981' : '#9ca3af') // emerald vs gray
        .attr('stroke', '#000')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .append('title').text(`xG: ${e.xg_value || '?'} | ${e.outcome || 'Unknown'}`);
    });
    
  }, [events]);

  return (
    <div className="w-full overflow-hidden rounded-md border border-gray-700">
      <svg ref={svgRef} className="w-full h-auto" />
    </div>
  );
}
