import { useId } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "next-themes";
import type { ArtistData } from "@/types";

interface ArtistBarTealProps {
  data: ArtistData[];
}

export default function ArtistBarTeal({ data }: ArtistBarTealProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const id = useId();

  const barFill = isDark ? "#2dd4bf" : "#0d9488";
  const top = data.slice(0, 10);

  return (
    <div role="img" aria-label="最常听歌手排行">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={top} layout="vertical" margin={{ left: 20 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="artist"
            width={80}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <Bar
            dataKey="count"
            fill={barFill}
            radius={[0, 4, 4, 0]}
            barSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>最常听歌手排行</caption>
        <thead>
          <tr>
            <th scope="col">歌手</th>
            <th scope="col">歌曲数</th>
          </tr>
        </thead>
        <tbody>
          {top.map((d) => (
            <tr key={`${id}-${d.artist}`}>
              <td>{d.artist}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
