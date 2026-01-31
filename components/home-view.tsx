"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WeightChart } from "@/components/weight-chart"
import { NumpadInput } from "@/components/numpad-input"
import { Scale, ArrowDown, ArrowUp, Target, Settings2 } from "lucide-react"

type PeriodGoal = {
  start_date: string
  end_date: string
  target_weight: number | null
}

interface HomeViewProps {
  currentWeight: number
  finalGoalWeight: number | null
  periodGoal: PeriodGoal | null
  weightHistory: { date: string; weight: number; isoDate?: string }[]
  onRecordWeight: (weight: number, isoDate: string) => void
  onSaveGoals: (payload: {
    final_goal_weight?: number | null
    period_goal?: PeriodGoal
  }) => Promise<void> | void
}

// 体重比較を計算するヘルパー関数
function calculateComparison(
  weightHistory: { date: string; weight: number }[],
  currentWeight: number,
  daysAgo: number
): { diff: number; hasData: boolean } {
  if (weightHistory.length < daysAgo + 1) {
    return { diff: 0, hasData: false }
  }
  const pastWeight = weightHistory[weightHistory.length - 1 - daysAgo]?.weight
  if (pastWeight == null) return { diff: 0, hasData: false }
  return { diff: currentWeight - pastWeight, hasData: true }
}

function ComparisonBox({
  label,
  diff,
  hasData,
}: {
  label: string
  diff: number
  hasData: boolean
}) {
  const isLoss = diff < 0
  const isGain = diff > 0
  const displayDiff = hasData ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : "--"

  return (
    <Card className="flex-1 border-2 border-border/50 bg-card">
      <CardContent className="flex flex-col items-center justify-center px-2 py-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1">
          {hasData && isLoss && <ArrowDown className="size-5 text-teal-600" />}
          {hasData && isGain && <ArrowUp className="size-5 text-orange-600" />}
          {hasData && !isLoss && !isGain && <span className="size-5" />}
          <span
            className={`text-lg font-bold ${
              isLoss ? "text-teal-700" : isGain ? "text-orange-700" : "text-muted-foreground"
            }`}
          >
            {displayDiff}
            {hasData && <span className="text-sm">kg</span>}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function HomeView({
  currentWeight,
  finalGoalWeight,
  periodGoal,
  weightHistory,
  onRecordWeight,
  onSaveGoals,
}: HomeViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false)
  const [recordIsoDate, setRecordIsoDate] = useState(() => getLocalISODate(new Date()))

  const periodGoalEndLabel = useMemo(() => {
    const endIso = periodGoal?.end_date
    if (!endIso) return null
    return toJapaneseMDFromISO(endIso)
  }, [periodGoal?.end_date])

  const finalRemaining = useMemo(() => {
    if (finalGoalWeight == null || !Number.isFinite(finalGoalWeight)) return null
    return Math.max(0, currentWeight - finalGoalWeight)
  }, [currentWeight, finalGoalWeight])

  const periodRemaining = useMemo(() => {
    const pg = periodGoal?.target_weight
    if (pg == null || !Number.isFinite(pg)) return null
    return Math.max(0, currentWeight - pg)
  }, [currentWeight, periodGoal?.target_weight])

  // 期間目標の「基準体重」を取得（開始日ピッタリに無くても、開始日前の直近 or 期間内の最初で補完）
  const periodBaseline = useMemo(() => {
    const startIso = periodGoal?.start_date
    const endIso = periodGoal?.end_date
    if (!startIso || !endIso) return null
    return findBaselineWeight(weightHistory, startIso, endIso)
  }, [weightHistory, periodGoal?.start_date, periodGoal?.end_date])

  const periodProgress = useMemo(() => {
    const goal = periodGoal?.target_weight
    if (periodBaseline == null || goal == null || !Number.isFinite(goal)) return null
    const base = periodBaseline
    const denom = goal - base
    if (denom === 0) {
      return { ratio: currentWeight === goal ? 1 : 0, base, goal }
    }
    const raw = (currentWeight - base) / denom
    const ratio = clamp(raw, 0, 1)
    return { ratio, base, goal }
  }, [currentWeight, periodBaseline, periodGoal?.target_weight])

  // 体重比較の計算
  const vsYesterday = calculateComparison(weightHistory, currentWeight, 1)
  const vsLastWeek = calculateComparison(weightHistory, currentWeight, 7)
  const vsLastMonth = calculateComparison(weightHistory, currentWeight, 30)

  const handleWeightSubmit = (weight: number) => {
    onRecordWeight(weight, recordIsoDate || getLocalISODate(new Date()))
    setIsModalOpen(false)
  }

  // 目標設定フォーム（モーダル内の入力状態）
  const [finalGoalInput, setFinalGoalInput] = useState("")
  const [periodStartAt, setPeriodStartAt] = useState("")
  const [periodEndAt, setPeriodEndAt] = useState("")
  const [periodGoalInput, setPeriodGoalInput] = useState("")
  const [savingGoals, setSavingGoals] = useState(false)

  useEffect(() => {
    if (!isGoalModalOpen) return
    setFinalGoalInput(finalGoalWeight == null ? "" : String(finalGoalWeight))
    setPeriodStartAt(periodGoal?.start_date ?? "")
    setPeriodEndAt(periodGoal?.end_date ?? "")
    setPeriodGoalInput(periodGoal?.target_weight == null ? "" : String(periodGoal.target_weight))
  }, [isGoalModalOpen, finalGoalWeight, periodGoal?.start_date, periodGoal?.end_date, periodGoal?.target_weight])

  const submitGoals = async () => {
    const payload: Parameters<typeof onSaveGoals>[0] = {}

    const finalTrim = finalGoalInput.trim()
    if (finalTrim.length > 0) {
      const n = Number(finalTrim)
      if (Number.isFinite(n)) payload.final_goal_weight = n
    }

    const ps = periodStartAt.trim()
    const pe = periodEndAt.trim()
    const pwTrim = periodGoalInput.trim()
    if (ps && pe && pwTrim) {
      const pw = Number(pwTrim)
      if (Number.isFinite(pw)) {
        payload.period_goal = { start_date: ps, end_date: pe, target_weight: pw }
      }
    }

    setSavingGoals(true)
    try {
      await onSaveGoals(payload)
      setIsGoalModalOpen(false)
    } finally {
      setSavingGoals(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">

      {/* 体重記録ボタン */}
      <Button
        onClick={() => {
          setRecordIsoDate(getLocalISODate(new Date()))
          setIsModalOpen(true)
        }}
        className="h-20 w-full rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02] hover:bg-primary/90"
      >
        <Scale className="mr-2 size-7" />
        体重を記録する
      </Button>

      {/* 現在の体重表示 */}
      <Card className="border-2 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col items-center justify-center px-4 py-4">
          <p className="mb-1 text-sm font-medium text-muted-foreground">現在の体重</p>
          <p className="text-4xl font-bold text-foreground">
            {currentWeight.toFixed(1)} <span className="text-2xl">kg</span>
          </p>
          <div className="mt-3 flex w-full flex-col gap-2">
            <div className="grid gap-2">
              <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 px-3 py-2">
                <Target className="size-5 text-red-600" />
                <p className="text-sm font-medium text-foreground">
                  最終目標{" "}
                  <span className="font-bold text-red-600">
                    {finalGoalWeight == null || !Number.isFinite(finalGoalWeight)
                      ? "未設定"
                      : `${finalGoalWeight.toFixed(1)} kg`}
                  </span>
                </p>
              </div>
              <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500/10 px-3 py-2">
                <Target className="size-5 text-orange-600" />
                <p className="text-sm font-medium text-foreground">
                  期間目標{" "}
                  <span className="font-bold text-orange-600">
                    {periodGoal?.target_weight == null || !Number.isFinite(periodGoal.target_weight)
                      ? "未設定"
                      : `${periodGoal.target_weight.toFixed(1)} kg`}
                  </span>
                  {periodGoalEndLabel ? (
                    <span className="ml-2 text-xs font-medium text-muted-foreground">
                      （{periodGoalEndLabel}まで）
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl bg-transparent"
              onClick={() => setIsGoalModalOpen(true)}
            >
              <Settings2 className="mr-2 size-4" />
              最終目標・期間目標を設定
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 体重比較行 */}
      <div className="flex gap-3">
        <ComparisonBox label="前日比" diff={vsYesterday.diff} hasData={vsYesterday.hasData} />
        <ComparisonBox label="先週比" diff={vsLastWeek.diff} hasData={vsLastWeek.hasData} />
        <ComparisonBox label="先月比" diff={vsLastMonth.diff} hasData={vsLastMonth.hasData} />
      </div>

      {/* 体重グラフ */}
      <Card className="border-2 border-border/50">
        <CardContent className="p-4">
          {/* 進捗カード */}
          <div className="mb-4 grid grid-cols-1 gap-3">
            <ProgressCard
              title="最終目標"
              remainingKg={finalRemaining}
              goalLabel={
                finalGoalWeight == null || !Number.isFinite(finalGoalWeight)
                  ? "未設定"
                  : `${finalGoalWeight.toFixed(1)} kg`
              }
            />
            <ProgressCard
              title="期間目標"
              subtitle={periodGoalEndLabel ? `（${periodGoalEndLabel}まで）` : undefined}
              remainingKg={periodRemaining}
              goalLabel={
                periodGoal?.target_weight == null || !Number.isFinite(periodGoal.target_weight)
                  ? "期間目標を設定してください"
                  : `${periodGoalEndLabel ?? ""}の目標まで`
              }
              progress={
                periodProgress
                  ? {
                      ratio: periodProgress.ratio,
                      caption: `基準 ${periodProgress.base.toFixed(1)} → 目標 ${periodProgress.goal.toFixed(1)} kg`,
                    }
                  : periodGoal?.target_weight != null
                    ? { ratio: null, caption: "基準体重が見つかりません（開始日付近の記録が必要です）" }
                    : null
              }
            />
          </div>
          
          <h3 className="mb-3 text-center text-lg font-bold text-foreground">体重の推移</h3>
          <div className="mb-2 flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded" style={{ backgroundColor: "var(--foreground)" }} />
              <span className="text-muted-foreground">実測値</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded border-t-2 border-dashed" style={{ borderColor: "var(--destructive)" }} />
              <span className="text-muted-foreground">最終目標</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-6 rounded" style={{ backgroundColor: "#10b981" }} />
              <span className="text-muted-foreground">期間目標</span>
            </div>
          </div>
          <div className="h-[300px] w-full min-w-0">
            <WeightChart
              data={weightHistory}
              finalGoalWeight={finalGoalWeight}
              target_weight={periodGoal?.target_weight ?? null}
            />
          </div>
        </CardContent>
      </Card>

      {/* 数字入力モーダル */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-[90vw] max-w-sm rounded-3xl border-2 border-primary/20 bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-foreground">
              体重入力
            </DialogTitle>
          </DialogHeader>
          <div className="mb-2 space-y-2">
            <Label htmlFor="record-date" className="text-sm">
              記録する日付
            </Label>
            <Input
              id="record-date"
              type="date"
              value={recordIsoDate}
              onChange={(e) => setRecordIsoDate(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </div>
          <NumpadInput
            initialValue={currentWeight}
            onSubmit={handleWeightSubmit}
            onCancel={() => setIsModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 目標設定モーダル */}
      <Dialog open={isGoalModalOpen} onOpenChange={setIsGoalModalOpen}>
        <DialogContent className="w-[90vw] max-w-sm rounded-3xl border-2 border-border/50 bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-foreground">
              目標を設定
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="final-goal">最終目標（kg）</Label>
              <Input
                id="final-goal"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={finalGoalInput}
                onChange={(e) => setFinalGoalInput(e.target.value)}
                placeholder="例: 65.0"
                className="h-12 rounded-2xl"
              />
              <p className="text-xs text-muted-foreground">
                保存先: <span className="font-mono">profiles.final_goal_weight</span>
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-border/60 p-3">
              <p className="text-sm font-bold text-foreground">期間目標</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="period-start">開始日</Label>
                  <Input
                    id="period-start"
                    type="date"
                    value={periodStartAt}
                    onChange={(e) => setPeriodStartAt(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="period-end">終了日</Label>
                  <Input
                    id="period-end"
                    type="date"
                    value={periodEndAt}
                    onChange={(e) => setPeriodEndAt(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="period-goal">目標体重（kg）</Label>
                <Input
                  id="period-goal"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={periodGoalInput}
                  onChange={(e) => setPeriodGoalInput(e.target.value)}
                  placeholder="例: 67.0"
                  className="h-11 rounded-xl"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                保存先: <span className="font-mono">period_goals(start_date, end_date, target_weight)</span>
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12 rounded-2xl bg-transparent"
                onClick={() => setIsGoalModalOpen(false)}
                disabled={savingGoals}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                className="flex-1 h-12 rounded-2xl font-bold"
                onClick={() => void submitGoals()}
                disabled={savingGoals}
              >
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProgressCard({
  title,
  subtitle,
  remainingKg,
  goalLabel,
  progress,
}: {
  title: string
  subtitle?: string
  remainingKg: number | null
  goalLabel: string
  progress?: { ratio: number | null; caption: string } | null
}) {
  const tone =
    remainingKg == null
      ? "border-border/50 bg-muted/30"
      : remainingKg <= 0
        ? "border-emerald-500/40 bg-emerald-500/10"
        : remainingKg <= 1
          ? "border-orange-500/40 bg-orange-500/10"
          : "border-border/50 bg-card"

  const textTone =
    remainingKg == null
      ? "text-muted-foreground"
      : remainingKg <= 0
        ? "text-emerald-700 dark:text-emerald-300"
        : remainingKg <= 1
          ? "text-orange-700 dark:text-orange-300"
          : "text-foreground"

  const barTone =
    remainingKg == null
      ? "bg-muted-foreground/25"
      : remainingKg <= 0
        ? "bg-emerald-500"
        : remainingKg <= 1
          ? "bg-orange-500"
          : "bg-red-500"

  return (
    <Card className={`border-2 ${tone}`}>
      <CardContent className="px-4 py-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold text-foreground">
            {title}
            {subtitle ? <span className="ml-1 text-xs font-medium text-muted-foreground">{subtitle}</span> : null}
            <span className="ml-1 text-xs font-medium text-muted-foreground">まで あと</span>
          </p>
          <p className="text-xs text-muted-foreground">{goalLabel}</p>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <span />
          <p className={`text-2xl font-extrabold ${textTone}`}>
            {remainingKg == null ? "--" : remainingKg.toFixed(1)}
            {remainingKg == null ? null : <span className="ml-1 text-sm font-bold">kg</span>}
          </p>
        </div>

        {progress ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-muted-foreground">{progress.caption}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
              <div
                className={`h-full ${barTone}`}
                style={{ width: `${Math.round(((progress.ratio ?? 0) * 100) * 10) / 10}%` }}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function getLocalISODate(d: Date) {
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function toJapaneseMDFromISO(iso: string) {
  const [, m, d] = iso.split("-")
  const mm = Number(m)
  const dd = Number(d)
  if (!Number.isFinite(mm) || !Number.isFinite(dd)) return iso
  return `${mm}月${dd}日`
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function findBaselineWeight(
  weightHistory: { date: string; weight: number; isoDate?: string }[],
  startIso: string,
  endIso: string
): number | null {
  const rows = weightHistory
    .flatMap((h) => {
      const iso = h.isoDate
      const w = Number(h.weight)
      if (!iso || !Number.isFinite(w)) return []
      return [{ iso, w }]
    })
    .sort((a, b) => a.iso.localeCompare(b.iso))

  if (rows.length === 0) return null

  // 1) 開始日ピッタリ
  const exact = rows.find((r) => r.iso === startIso)
  if (exact) return exact.w

  // 2) 開始日より前の直近
  const before = [...rows].reverse().find((r) => r.iso < startIso)
  if (before) return before.w

  // 3) 期間内の最初（開始日以降〜終了日まで）
  const within = rows.find((r) => r.iso >= startIso && r.iso <= endIso)
  if (within) return within.w

  // 4) それでも無ければ開始日以降の最初
  const after = rows.find((r) => r.iso > startIso)
  if (after) return after.w

  return null
}
