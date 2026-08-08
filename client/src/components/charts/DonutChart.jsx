/**
 * Minimal donut chart with legend (dependency-free SVG).
 * @param {{label:string,value:number,color:string}[]} segments
 */
export default function DonutChart({ segments }) {
  const size = 180;
  const r = 70;
  const stroke = 26;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);

  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const dash = frac * circumference;
    const arc = {
      ...seg,
      dashArray: `${dash} ${circumference - dash}`,
      dashOffset: -offset,
    };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {total > 0 &&
          arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={a.dashArray}
              strokeDashoffset={a.dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-800"
          style={{ fontSize: 26, fontWeight: 700 }}
        >
          {total}
        </text>
      </svg>

      <ul className="space-y-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-semibold text-slate-800">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
