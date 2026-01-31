"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, History, Timer, Footprints, Wine, Apple, Moon, Dumbbell, Pencil, Trash2 } from "lucide-react"

export type QuestIcon = "walk" | "alcohol" | "food" | "sleep" | "exercise"

export interface QuestDefinition {
  id: string
  title: string
  description: string
  points: number
  icon: QuestIcon
}

export interface QuestHistoryItem {
  id: string
  title: string
  points: number
  occurredAt: string // ISO
  isDummy?: boolean
}

interface QuestViewProps {
  activeUser: "じぃじ" | "ばぁば"
  points: number
  refreshPoints: () => Promise<void>
  quests: QuestDefinition[]
  completedQuestIds: string[]
  onCompleteQuest: (questId: string) => Promise<void>
  onCreateQuest: (payload: { title: string; description: string; points: number; icon: QuestIcon }) => Promise<void>
  onUpdateQuest: (
    questId: string,
    payload: { title: string; description: string; points: number; icon: QuestIcon }
  ) => Promise<void>
  onDeleteQuest: (questId: string) => Promise<void>
  history: QuestHistoryItem[]
}

const iconMap = {
  walk: Footprints,
  alcohol: Wine,
  food: Apple,
  sleep: Moon,
  exercise: Dumbbell,
}

export function QuestView({
  activeUser,
  quests,
  completedQuestIds,
  onCompleteQuest,
  onCreateQuest,
  onUpdateQuest,
  onDeleteQuest,
  history,
  refreshPoints,
}: QuestViewProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [pointsInput, setPointsInput] = useState("")
  const [icon, setIcon] = useState<QuestIcon>("walk")
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<QuestDefinition | null>(null)

  const completedIdsSet = useMemo(() => new Set(completedQuestIds), [completedQuestIds])

  const isEditing = editingQuestId != null

  const canSubmit = useMemo(() => {
    const t = title.trim()
    const p = Number(pointsInput.trim())
    return t.length > 0 && Number.isFinite(p) && p >= 0 && !isSaving
  }, [title, pointsInput, isSaving])

  const openAdd = () => {
    setEditingQuestId(null)
    setTitle("")
    setDescription("")
    setPointsInput("")
    setIcon("walk")
    setIsEditorOpen(true)
  }

  const openEdit = (q: QuestDefinition) => {
    setEditingQuestId(q.id)
    setTitle(q.title ?? "")
    setDescription(q.description ?? "")
    setPointsInput(String(q.points ?? 0))
    setIcon(q.icon)
    setIsEditorOpen(true)
  }

  const submit = async () => {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        points: Math.max(0, Number(pointsInput.trim())),
        icon,
      }

      if (editingQuestId) {
        await onUpdateQuest(editingQuestId, payload)
      } else {
        await onCreateQuest(payload)
      }

      setIsEditorOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 今日のクエスト */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer className="size-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">今日のクエスト</h2>
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

      {/* クエストリスト */}
      <div className="grid grid-cols-3 gap-3">
        {quests.map((quest) => {
          const Icon = iconMap[quest.icon]
          const isCompleted = completedIdsSet.has(quest.id)
          const canComplete = !isCompleted
          return (
            <button
              key={quest.id}
              type="button"
              onClick={() => {
                if (!canComplete) return
                void (async () => {
                  await onCompleteQuest(quest.id)
                  await refreshPoints()
                })()
              }}
              className={`group relative rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
                isCompleted
                  ? "border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-800/30 dark:bg-emerald-950/10"
                  : "border-border/50 bg-card hover:border-border"
              }`}
              aria-disabled={!canComplete}
            >
              {isCompleted && (
                <div className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                  <Check className="size-4" />
                </div>
              )}

              {/* 編集/削除（控えめ） */}
              <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openEdit(quest)
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
                    setDeleteTarget(quest)
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
                    isCompleted
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : activeUser === "じぃじ"
                        ? "bg-teal-500/15 text-teal-700 dark:text-teal-200"
                        : "bg-orange-500/15 text-orange-700 dark:text-orange-200"
                  }`}
                >
                  <Icon className="size-6" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-center text-[12px] font-bold leading-snug text-foreground">
                    {quest.title}
                  </p>
                </div>

                <div
                  className={`rounded-full px-2.5 py-1 text-center text-[11px] font-bold ${
                    isCompleted
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : activeUser === "じぃじ"
                        ? "bg-teal-500/15 text-teal-800 dark:text-teal-200"
                        : "bg-orange-500/15 text-orange-800 dark:text-orange-200"
                  }`}
                >
                  +{quest.points} pt
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* クエスト履歴 */}
      <div className="mt-2 flex items-center gap-2">
        <History className="size-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">クエスト履歴</h2>
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
                  +{h.points} pt
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
              {isEditing ? "クエストを編集" : "クエストを追加"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quest-title" className="text-sm">
                タイトル
              </Label>
              <Input
                id="quest-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：朝の散歩"
                className="h-12 rounded-2xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit()
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quest-desc" className="text-sm">
                説明（任意）
              </Label>
              <Input
                id="quest-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例：30分以上歩く"
                className="h-12 rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quest-points" className="text-sm">
                ポイント
              </Label>
              <Input
                id="quest-points"
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                placeholder="例：50"
                className="h-12 rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">アイコン</Label>
              <div className="grid grid-cols-5 gap-2">
                {(["walk", "alcohol", "food", "sleep", "exercise"] as const).map((k) => {
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
                    await onDeleteQuest(id)
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
