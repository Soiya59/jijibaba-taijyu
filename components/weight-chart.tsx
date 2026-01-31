"use client"

import { useSyncExternalStore } from "react"
import { Line, LineChart, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface WeightChartProps {
  data: { date: string; weight: number }[]
  finalGoalWeight?: number | null
  target_weight?: number | null
}

const chartConfig = {
  weight: {
    label: "実測値",
    color: "var(--foreground)",
  },
}

function useIsClient() {
  // useEffect での setState を避けつつ、SSR/CSR の分岐を安全に行う
  return useSyncExternalStore(
    () => () => {
      // no-op
    },
    () => true,
    () => false
  )
}

export function WeightChart({ data, finalGoalWeight, target_weight }: WeightChartProps) {
  const mounted = useIsClient()

  const goalValues = [finalGoalWeight, target_weight].flatMap((v) =>
    typeof v === "number" && Number.isFinite(v) ? [v] : []
  )
  const weightValues = data.flatMap((d) => (Number.isFinite(d.weight) ? [d.weight] : []))
  const allValues = [...weightValues, ...goalValues]

  const minData = allValues.length > 0 ? Math.min(...allValues) : 0
  const maxData = allValues.length > 0 ? Math.max(...allValues) : 100
  const minWeight = minData - 2
  const maxWeight = maxData + 2

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      {/* Recharts の ResponsiveContainer は SSR 時に height/width が 0/-1 になりやすいので、クライアントマウント後に描画する */}
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              domain={[minWeight, maxWeight]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="line" hideLabel />} />
            {typeof finalGoalWeight === "number" && Number.isFinite(finalGoalWeight) ? (
              <ReferenceLine
                y={finalGoalWeight}
                stroke="var(--destructive)"
                strokeDasharray="3 3"
                strokeWidth={2}
              />
            ) : null}

            {typeof target_weight === "number" && Number.isFinite(target_weight) ? (
              <ReferenceLine
                y={target_weight}
                stroke="#10b981"
                strokeWidth={2}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="weight"
              stroke="var(--foreground)"
              strokeWidth={3}
              dot={{ fill: "var(--foreground)", strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: "var(--foreground)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : null}
    </ChartContainer>
  )
}
