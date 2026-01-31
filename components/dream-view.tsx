"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Star, Pencil, Trash2 } from "lucide-react"

interface Wish {
  id: string
  title: string
  completed: boolean
  icon: string // 絵文字
}

interface DreamViewProps {
  activeUser: "じぃじ" | "ばぁば"
  wishes: Wish[]
  onToggleWish: (wishId: string) => void
  onCreateWish: (payload: { icon: string; title: string }) => Promise<void>
  onUpdateWish: (wishId: string, payload: { icon: string; title: string }) => Promise<void>
  onDeleteWish: (wishId: string) => Promise<void>
}

export function DreamView({
  activeUser,
  wishes,
  onToggleWish,
  onCreateWish,
  onUpdateWish,
  onDeleteWish,
}: DreamViewProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingWishId, setEditingWishId] = useState<string | null>(null)
  const [icon, setIcon] = useState("⭐")
  const [title, setTitle] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Wish | null>(null)

  const isEditing = editingWishId != null

  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && icon.trim().length > 0 && !isSaving
  }, [icon, title, isSaving])

  const openAdd = () => {
    setEditingWishId(null)
    setIcon("⭐")
    setTitle("")
    setIsEditorOpen(true)
  }

  const openEdit = (w: Wish) => {
    setEditingWishId(w.id)
    setIcon(w.icon ?? "⭐")
    setTitle(w.title ?? "")
    setIsEditorOpen(true)
  }

  const submit = async () => {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      const payload = { icon: icon.trim() || "⭐", title: title.trim() }
      if (editingWishId) {
        await onUpdateWish(editingWishId, payload)
      } else {
        await onCreateWish(payload)
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
          <Star className="size-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">やりたいことリスト</h2>
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

      {/* やりたいこと一覧 */}
      <div className="grid grid-cols-3 gap-3">
        {wishes.map((wish) => {
          return (
            <button
              key={wish.id}
              type="button"
              onClick={() => onToggleWish(wish.id)}
              aria-pressed={wish.completed}
              className={`group relative rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
                wish.completed
                  ? "border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-800/30 dark:bg-emerald-950/10"
                  : "border-border/50 bg-card hover:border-border"
              }`}
            >
              {wish.completed && (
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
                    openEdit(wish)
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
                    setDeleteTarget(wish)
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
                  className={`mt-1 flex size-12 items-center justify-center rounded-2xl text-2xl ${
                    wish.completed
                      ? "bg-emerald-500/15"
                      : activeUser === "じぃじ"
                        ? "bg-teal-500/15"
                        : "bg-orange-500/15"
                  }`}
                >
                  <span aria-hidden className="leading-none">
                    {wish.icon}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-center text-[12px] font-bold leading-snug text-foreground">
                    {wish.title}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

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
              {isEditing ? "やりたいことを編集" : "やりたいことを追加"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wish-icon" className="text-sm">
                アイコン（絵文字）
              </Label>
              <Input
                id="wish-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="⭐"
                className="h-12 rounded-2xl text-center text-2xl"
                inputMode="text"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wish-title" className="text-sm">
                タイトル
              </Label>
              <Input
                id="wish-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：温泉旅行に行く"
                className="h-12 rounded-2xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit()
                }}
              />
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
                    await onDeleteWish(id)
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
