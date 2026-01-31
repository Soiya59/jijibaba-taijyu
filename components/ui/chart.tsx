"use client"

import * as React from "react"
import { Tooltip } from "recharts"

import { cn } from "@/lib/utils"

type ChartConfig = Record<
  string,
  {
    label?: string
    color?: string
  }
>

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig
  className?: string
  children: React.ReactNode
}) {
  // shadcn/ui のチャート互換: ここではスタイル/レイアウトの枠だけを提供
  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn("w-full min-w-0", className)}>{children}</div>
    </ChartContext.Provider>
  )
}

type ChartTooltipProps = React.ComponentProps<typeof Tooltip>

export function ChartTooltip(props: ChartTooltipProps) {
  return (
    <Tooltip
      {...props}
      wrapperStyle={{ outline: "none" }}
      content={props.content ?? <ChartTooltipContent />}
    />
  )
}

type ChartTooltipItem = {
  dataKey?: string | number
  name?: string
  value?: unknown
  color?: string
}

type ChartTooltipContentProps = {
  active?: boolean
  payload?: ChartTooltipItem[]
  label?: unknown
  hideLabel?: boolean
  indicator?: "dot" | "line"
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel,
  indicator = "dot",
}: ChartTooltipContentProps) {
  const ctx = React.useContext(ChartContext)

  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-xl border-2 border-border/50 bg-card px-3 py-2 text-sm shadow-md">
      {!hideLabel && label != null && (
        <div className="mb-1 text-xs font-medium text-muted-foreground">{String(label)}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((item) => {
          const dataKey = String(item.dataKey ?? "value")
          const config = ctx?.config?.[dataKey]
          const color = (item.color as string | undefined) ?? config?.color ?? "var(--primary)"
          const value =
            typeof item.value === "number" ? item.value.toFixed(1) : String(item.value ?? "")

          return (
            <div key={`${dataKey}-${item.name}`} className="flex items-center gap-2">
              {indicator === "line" ? (
                <span className="h-[2px] w-5 rounded" style={{ backgroundColor: color }} />
              ) : (
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
              )}
              <span className="text-xs text-muted-foreground">{config?.label ?? item.name ?? dataKey}</span>
              <span className="ml-auto font-bold text-foreground">{value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

