'use client';

import { formatMinutes, formatMinutesCompact } from '@/lib/study/format';
import type { SubjectTotal } from '@/lib/study/stats';

/** 各科时长占比环形图（纯 SVG，无图表库依赖；配色与科目固定色一致） */
export function DonutChart({
  data,
  totalMin,
  size = 176,
  thickness = 20,
}: {
  data: SubjectTotal[];
  totalMin: number;
  size?: number;
  thickness?: number;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--c-chip))"
          strokeWidth={thickness}
        />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((item) => {
            const length = totalMin > 0 ? (item.totalMin / totalMin) * circumference : 0;
            const dash = `${Math.max(0, length - 1.5)} ${circumference}`;
            const circle = (
              <circle
                key={item.subject}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return circle;
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] text-faint">本周期</span>
        <span className="text-lg font-semibold text-content leading-tight" title={formatMinutes(totalMin)}>
          {formatMinutesCompact(totalMin)}
        </span>
        <span className="text-[11px] text-faint mt-0.5">{data.length} 个科目</span>
      </div>
    </div>
  );
}
