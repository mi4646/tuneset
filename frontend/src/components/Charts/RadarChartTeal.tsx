import { useId } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "next-themes";
import type { AxisData } from "@/types";

interface RadarChartTealProps {
  data: AxisData[];
}

export default function RadarChartTeal({ data }: RadarChartTealProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const id = useId();

  const fill = isDark ? "#2dd4bf" : "#14b8a6";
  const stroke = isDark ? "#2dd4bf" : "#0d9488";

  return (
    <div
      role="img"
      aria-label="听歌画像雷达图"
    >
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            dataKey="value"
            fill={fill}
            fillOpacity={0.3}
            stroke={stroke}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>听歌画像各维度得分</caption>
        <thead>
          <tr>
            <th scope="col">维度</th>
            <th scope="col">得分</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={`${id}-${d.axis}`}>
              <td>{d.axis}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
