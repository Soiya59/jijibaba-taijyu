"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Gift, History, Beer, Cookie, Phone, Coffee, Tv, ShoppingBag, Pencil, Trash2 } from "lucide-react"

export type RewardIcon = "beer" | "snack" | "call" | "coffee" | "tv" | "shopping"

export interface RewardDefinition {
  id: string
  title: string
  cost: number
  icon: RewardIcon
}

export interface RewardHistoryItem {
  id: string
  title: string
  cost: number
  occurredAt: string // ISO
  isDummy?: boolean
}

interface RewardViewProps {
  activeUser: "じぃじ" | "ばぁば"
  rewards: RewardDefinition[]
  points: number
  refreshPoints: () => Promise<void>
  onRedeem: (rewardId: string) => Promise<void>
  onCreateReward: (payload: { title: string; cost: number; icon: RewardIcon }) => Promise<void>
  onUpdateReward: (rewardId: string, payload: { title: string; cost: number; icon: RewardIcon }) => Promise<void>
  onDeleteReward: (rewardId: string) => Promise<void>
  history: RewardHistoryItem[]
}

const iconMap = {
  beer: Beer,
  snack: Cookie,
  call: Phone,
  coffee: Coffee,
  tv: Tv,
  shopping: ShoppingBag,
}

export function RewardView({
  activeUser,
  rewards,
  points,
  onRedeem,
  onCreateReward,
  onUpdateReward,
  onDeleteReward,
  history,
  refreshPoints,
}: RewardViewProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [costInput, setCostInput] = useState("")
  const [icon, setIcon] = useState<RewardIcon>("coffee")
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<RewardDefinition | null>(null)

  const isEditing = editingRewardId != null

  const canSubmit = useMemo(() => {
    const t = title.trim()
    const c = Number(costInput.trim())
    return t.length > 0 && Number.isFinite(c) && c >= 0 && !isSaving
  }, [title, costInput, isSaving])

  const openAdd = () => {
    setEditingRewardId(null)
    setTitle("")
    setCostInput("")
    setIcon("coffee")
    setIsEditorOpen(true)
  }

  const openEdit = (r: RewardDefinition) => {
    setEditingRewardId(r.id)
    setTitle(r.title ?? "")
    setCostInput(String(r.cost ?? 0))
    setIcon(r.icon)
    setIsEditorOpen(true)
  }

  const submit = async () => {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      const payload = { title: title.trim(), cost: Math.max(0, Number(costInput.trim())), icon }
      if (editingRewardId) {
        await onUpdateReward(editingRewardId, payload)
      } else {
        await onCreateReward(payload)
      }
      setIsEditorOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift className="size-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">ごほうびを選ぼう</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 rounded-xl border-2 px-3 text-sm font-bold"
          onClick={openAdd}
        >
          ＋ 追加
        </Button>
      </div>

      {/* リワードグリッド */}
      <div className="grid grid-cols-3 gap-3">
        {rewards.map((reward) => {
          const Icon = iconMap[reward.icon]
          const canAfford = points >= reward.cost
          return (
            <button
              key={reward.id}
              type="button"
              onClick={() => {
                if (!canAfford) return
                void (async () => {
                  await onRedeem(reward.id)
                  await refreshPoints()
                })()
              }}
              className={`group relative rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
                canAfford ? "border-border/50 bg-card hover:border-border" : "border-border/30 bg-muted/40"
              }`}
              aria-disabled={!canAfford}
            >
              {/* 編集/削除（控えめ） */}
              <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openEdit(reward)
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-full border border-border/40 bg-background/70 text-muted-foreground opacity-40 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
                  aria-label="編集"
                  title="編集"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDeleteTarget(reward)
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-full border border-border/40 bg-background/70 text-muted-foreground opacity-40 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
                  aria-label="削除"
                  title="削除"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <div className="flex h-full flex-col items-center justify-between gap-2">
                <div
                  className={`mt-1 flex size-12 items-center justify-center rounded-2xl ${
                    canAfford
                      ? activeUser === "じぃじ"
                        ? "bg-teal-500/15 text-teal-700 dark:text-teal-200"
                        : "bg-orange-500/15 text-orange-700 dark:text-orange-200"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-6" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-center text-[12px] font-bold leading-snug text-foreground">
                    {reward.title}
                  </p>
                </div>

                <div
                  className={`rounded-full px-2.5 py-1 text-center text-[11px] font-bold ${
                    activeUser === "じぃじ"
                      ? "bg-teal-500/15 text-teal-800 dark:text-teal-200"
                      : "bg-orange-500/15 text-orange-800 dark:text-orange-200"
                  }`}
                >
                  {reward.cost} pt
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 交換履歴 */}
      <div className="mt-2 flex items-center gap-2">
        <History className="size-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">交換履歴</h2>
        <span className="text-xs font-medium text-muted-foreground">直近20件</span>
      </div>

      <Card className="border-2 border-border/50 bg-card">
        <CardContent className="p-3">
          <ul className="flex flex-col divide-y divide-border/40">
            {history.slice(0, 20).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {h.title}
                    {h.isDummy ? <span className="ml-1 text-xs font-medium text-muted-foreground">(テスト)</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(h.occurredAt).toLocaleString("ja-JP")}</p>
                </div>
                <div
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    activeUser === "じぃじ"
                      ? "bg-teal-500/15 text-teal-800 dark:text-teal-200"
                      : "bg-orange-500/15 text-orange-800 dark:text-orange-200"
                  }`}
                >
                  -{h.cost} pt
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 追加/編集モーダル */}
      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          if (isSaving) return
          setIsEditorOpen(open)
        }}
      >
        <DialogContent className="w-[90vw] max-w-sm rounded-3xl border-2 border-primary/20 bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-foreground">
              {isEditing ? "ごほうびを編集" : "ごほうびを追加"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reward-title" className="text-sm">
                タイトル
              </Label>
              <Input
                id="reward-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：コーヒータイム"
                className="h-12 rounded-2xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit()
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reward-cost" className="text-sm">
                必要ポイント
              </Label>
              <Input
                id="reward-cost"
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                placeholder="例：50"
                className="h-12 rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">アイコン</Label>
              <div className="grid grid-cols-6 gap-2">
                {(["beer", "snack", "call", "coffee", "tv", "shopping"] as const).map((k) => {
                  const I = iconMap[k]
                  const active = icon === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setIcon(k)}
                      className={`flex h-12 items-center justify-center rounded-2xl border-2 transition-all ${
                        active ? "border-primary bg-primary/10" : "border-border/50 bg-card"
                      }`}
                      aria-pressed={active}
                    >
                      <I className="size-5" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 rounded-2xl border-2"
                onClick={() => setIsEditorOpen(false)}
                disabled={isSaving}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                className="h-12 flex-1 rounded-2xl text-base font-bold"
                onClick={() => void submit()}
                disabled={!canSubmit}
              >
                {isEditing ? "更新する" : "追加する"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <Dialog open={deleteTarget != null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent className="w-[90vw] max-w-sm rounded-3xl border-2 border-border/50 bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-foreground">削除の確認</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            「{deleteTarget?.title ?? ""}」を本当に削除しますか？
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 rounded-2xl border-2"
              onClick={() => setDeleteTarget(null)}
              disabled={isSaving}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-12 flex-1 rounded-2xl text-base font-bold"
              onClick={() => {
                const id = deleteTarget?.id
                if (!id) return
                setIsSaving(true)
                void (async () => {
                  try {
                    await onDeleteReward(id)
                    setDeleteTarget(null)
                  } finally {
                    setIsSaving(false)
                  }
                })()
              }}
              disabled={!deleteTarget?.id || isSaving}
            >
              削除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
