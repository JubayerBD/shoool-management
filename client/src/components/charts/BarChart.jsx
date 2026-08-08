/**
 * Minimal responsive vertical bar chart (dependency-free SVG).
 * @param {{label:string,value:number}[]} data  Labels should be pre-resolved strings.
 * @param {string} [unit]  Optional prefix for value labels (e.g. "৳").
 */
export default function BarChart({ data, unit = '' }) {
  const width = 480;
  const height = 220;
  const pad = { top: 20, right: 12, bottom: 32, left: 12 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length || 1;
  const slot = chartW / n;
  const barW = Math.min(56, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
      {/* baseline */}
      <line
        x1={pad.left}
        y1={pad.top + chartH}
        x2={width - pad.right}
        y2={pad.top + chartH}
        stroke="#e2e8f0"
      />
      {data.map((d, i) => {
        const h = (d.value / max) * chartH;
        const x = pad.left + i * slot + (slot - barW) / 2;
        const y = pad.top + chartH - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx="4" fill="#2563eb" />
            <text
              x={x + barW / 2}
              y={y - 6}
              textAnchor="middle"
              className="fill-slate-600"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              {unit}
              {d.value}
            </text>
            <text
              x={x + barW / 2}
              y={pad.top + chartH + 18}
              textAnchor="middle"
              className="fill-slate-500"
              style={{ fontSize: 11 }}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
