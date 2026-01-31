"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HomeView } from "@/components/home-view"
import { QuestView } from "@/components/quest-view"
import { RewardView } from "@/components/reward-view"
import { DreamView } from "@/components/dream-view"
import { BottomNavigation } from "@/components/bottom-navigation"
import { Button } from "@/components/ui/button"
import type { QuestDefinition, QuestHistoryItem, QuestIcon } from "@/components/quest-view"
import type { RewardDefinition, RewardHistoryItem, RewardIcon } from "@/components/reward"
import { getSupabaseClient } from "@/lib/supabase"

type Tab = "home" | "quest" | "reward" | "dream"
type ActiveUser = "じぃじ" | "ばぁば"
type UserKey = "jiiji" | "baaba"

type WeightHistoryItem = { date: string; weight: number; isoDate: string }
type WishItem = { id: string; icon: string; title: string; completed: boolean; createdAt?: string }
type PeriodGoal = { start_date: string; end_date: string; target_weight: number | null }

const USERS: ActiveUser[] = ["じぃじ", "ばぁば"]

function isUuidLike(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function isMissingUserColumnError(err: unknown) {
  const msg = String((err as { message?: unknown } | null | undefined)?.message ?? "")
  // PostgREST の典型: "Could not find the 'user' column of 'quests' in the schema cache"
  if (msg.includes("'user' column") && msg.includes("schema cache")) return true
  // Postgres の典型: column "user" does not exist
  if (msg.includes("column") && msg.includes('"user"') && msg.includes("does not exist")) return true
  if (msg.includes("column") && msg.includes("user") && msg.includes("does not exist")) return true
  return false
}

function supabaseErrorInfo(err: unknown) {
  const e = err as
    | {
        name?: unknown
        message?: unknown
        details?: unknown
        hint?: unknown
        code?: unknown
        status?: unknown
        statusCode?: unknown
        statusText?: unknown
        cause?: unknown
      }
    | null
    | undefined

  return {
    name: typeof e?.name === "string" ? e.name : undefined,
    message: typeof e?.message === "string" ? e.message : String(e?.message ?? ""),
    details: e?.details,
    hint: e?.hint,
    code: e?.code,
    status: e?.status ?? e?.statusCode,
    statusText: e?.statusText,
    cause: e?.cause,
  }
}

function logSupabaseError(context: string, err: unknown) {
  if (!err) return
  // ユーザー要望: まず「Supabase Error: <error>」形式で出す
  console.error("Supabase Error:", err)
  // Next.jsのconsole表示で {} になっても、message等は別で必ず見えるようにする
  console.error("Supabase Error Detail:", { context, ...supabaseErrorInfo(err) })

  // #region agent log (debug)
  fetch("http://127.0.0.1:7243/ingest/6a43e64c-5eb7-4987-8391-369e0be682d9", {
    method: "POST",
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "A",
      location: "app/page.tsx:logSupabaseError",
      message: "Supabase error surfaced",
      data: { context, ...supabaseErrorInfo(err) },
      timestamp: Date.now(),
    }),
    // ブラウザCORS preflight回避のため no-cors
    mode: "no-cors",
    keepalive: true,
  }).catch(() => {})
  // #endregion
}

function toUserKey(user: ActiveUser): UserKey {
  return user === "じぃじ" ? "jiiji" : "baaba"
}

function makeId(prefix: string) {
  try {
    const c = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined
    if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`
  } catch {
    // ignore
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function padTo20<T>(items: T[], makeDummy: (i: number) => T) {
  const out = [...items]
  for (let i = 0; out.length < 20; i++) out.push(makeDummy(i))
  return out.slice(0, 20)
}

function buildDummyQuestHistoryItem(userKey: UserKey, i: number, offset: number): QuestHistoryItem {
  const titles = ["トレーニング", "お風呂掃除", "朝の散歩", "ストレッチ", "野菜を食べた", "早寝"]
  const pointsList = [10, 20, 30, 40, 50, 80, 100]
  const occurredAt = new Date(Date.now() - (offset + i) * 60 * 60 * 1000).toISOString()
  return {
    id: makeId(`dummy-quest-${userKey}-${i}`),
    title: titles[(offset + i) % titles.length] ?? "クエスト",
    points: pointsList[(offset + i) % pointsList.length] ?? 10,
    occurredAt,
    isDummy: true,
  }
}

function buildDummyRewardHistoryItem(userKey: UserKey, i: number, offset: number): RewardHistoryItem {
  const titles = ["コーヒータイム", "お菓子", "孫と電話", "テレビ1時間", "ビール1本", "お買い物"]
  const costList = [10, 30, 50, 60, 80, 100, 200]
  const occurredAt = new Date(Date.now() - (offset + i) * 60 * 60 * 1000).toISOString()
  return {
    id: makeId(`dummy-reward-${userKey}-${i}`),
    title: titles[(offset + i) % titles.length] ?? "ごほうび",
    cost: costList[(offset + i) % costList.length] ?? 30,
    occurredAt,
    isDummy: true,
  }
}

function buildDummyQuestHistory(userKey: UserKey, count: number) {
  return Array.from({ length: count }, (_, i) => buildDummyQuestHistoryItem(userKey, i, 0))
}

function buildDummyRewardHistory(userKey: UserKey, count: number) {
  return Array.from({ length: count }, (_, i) => buildDummyRewardHistoryItem(userKey, i, 0))
}

const initialQuestDefinitions: QuestDefinition[] = [
  { id: "q1", title: "朝の散歩", description: "30分以上歩く", points: 50, icon: "walk" },
  { id: "q2", title: "お酒を控えた", description: "今日はお酒なし", points: 100, icon: "alcohol" },
  { id: "q3", title: "野菜を食べた", description: "3種類以上の野菜", points: 30, icon: "food" },
  { id: "q4", title: "ストレッチ", description: "5分間のストレッチ", points: 20, icon: "exercise" },
  { id: "q5", title: "間食を控えた", description: "おやつなしで過ごす", points: 80, icon: "food" },
  { id: "q6", title: "早寝", description: "22時前に就寝", points: 50, icon: "sleep" },
]

const initialRewardDefinitions: RewardDefinition[] = [
  { id: "r1", title: "ビール1本", cost: 100, icon: "beer" },
  { id: "r2", title: "お菓子", cost: 80, icon: "snack" },
  { id: "r3", title: "孫と電話", cost: 50, icon: "call" },
  { id: "r4", title: "コーヒータイム", cost: 30, icon: "coffee" },
  { id: "r5", title: "テレビ1時間", cost: 60, icon: "tv" },
  { id: "r6", title: "お買い物", cost: 200, icon: "shopping" },
]

const initialWishes: WishItem[] = [
  { id: "w1", icon: "👔", title: "昔のスーツを着る", completed: false },
  { id: "w2", icon: "✈️", title: "旅行に行く", completed: false },
  { id: "w3", icon: "📸", title: "家族写真を撮る", completed: false },
  { id: "w4", icon: "⛰️", title: "山登りをする", completed: false },
]

export default function WeightManagementApp() {
  const [activeTab, setActiveTab] = useState<Tab>("home")
  const [activeUser, setActiveUser] = useState<ActiveUser>(() => {
    if (typeof window === "undefined") return "じぃじ"
    try {
      const raw = window.localStorage.getItem("jijibaba-taijyu.activeUser")
      return raw === "じぃじ" || raw === "ばぁば" ? raw : "じぃじ"
    } catch {
      return "じぃじ"
    }
  })
  const activeUserKey: UserKey = toUserKey(activeUser)
  const aliveRef = useRef(true)

  useEffect(() => {
    // #region agent log (debug)
    fetch("http://127.0.0.1:7243/ingest/6a43e64c-5eb7-4987-8391-369e0be682d9", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "app/page.tsx:WeightManagementApp mount",
        message: "Env snapshot",
        data: {
          // 秘密情報は出さない（URLはホストだけ）
          supabaseUrlHost:
            typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string"
              ? (() => {
                  try {
                    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
                  } catch {
                    return "invalid-url"
                  }
                })()
              : "missing",
          hasAnonKey: typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string",
        },
        timestamp: Date.now(),
      }),
      mode: "no-cors",
      keepalive: true,
    }).catch(() => {})
    // #endregion
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem("jijibaba-taijyu.activeUser", activeUser)
    } catch {
      // ignore
    }
  }, [activeUser])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const [progressByUser, setProgressByUser] = useState<
    Record<UserKey, { level: number; points: number }>
  >({
    jiiji: { level: 5, points: 0 },
    baaba: { level: 5, points: 0 },
  })

  const [finalGoalWeightByUser, setFinalGoalWeightByUser] = useState<Record<UserKey, number | null>>({
    jiiji: null,
    baaba: null,
  })
  const [periodGoalByUser, setPeriodGoalByUser] = useState<Record<UserKey, PeriodGoal | null>>({
    jiiji: null,
    baaba: null,
  })
  const [weightHistoryByUser, setWeightHistoryByUser] = useState<
    Record<UserKey, WeightHistoryItem[]>
  >({
    jiiji: [],
    baaba: [],
  })
  const [questDefinitions, setQuestDefinitions] = useState<QuestDefinition[]>(initialQuestDefinitions)
  const [completedQuestIdsByUser, setCompletedQuestIdsByUser] = useState<Record<UserKey, string[]>>({
    jiiji: [],
    baaba: [],
  })
  const [rewardDefinitions, setRewardDefinitions] = useState<RewardDefinition[]>(initialRewardDefinitions)
  const [wishes, setWishes] = useState<WishItem[]>(initialWishes)
  const [questHistoryByUser, setQuestHistoryByUser] = useState<Record<UserKey, QuestHistoryItem[]>>({
    jiiji: [],
    baaba: [],
  })
  const [rewardHistoryByUser, setRewardHistoryByUser] = useState<Record<UserKey, RewardHistoryItem[]>>({
    jiiji: [],
    baaba: [],
  })

  const points = progressByUser[activeUserKey].points
  const finalGoalWeight = finalGoalWeightByUser[activeUserKey]
  const periodGoal = periodGoalByUser[activeUserKey]
  const weightHistory = weightHistoryByUser[activeUserKey]
  const questHistory = questHistoryByUser[activeUserKey]
  const rewardHistory = rewardHistoryByUser[activeUserKey]

  const currentWeight = useMemo(
    () => weightHistory[weightHistory.length - 1]?.weight ?? 0,
    [weightHistory]
  )

  const refreshQuests = useCallback(async (user: ActiveUser) => {
    const supabase = getSupabaseClient()
    if (!supabase) return

    // #region agent log (debug)
    fetch("http://127.0.0.1:7243/ingest/6a43e64c-5eb7-4987-8391-369e0be682d9", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "app/page.tsx:refreshQuests(entry)",
        message: "refreshQuests called",
        data: { user },
        timestamp: Date.now(),
      }),
      mode: "no-cors",
      keepalive: true,
    }).catch(() => {})
    // #endregion

    // まず user で絞る（user列が無ければ自動フォールバック）
    const withUser = await supabase
      .from("quests")
      .select("id, title, description, points, icon, created_at")
      .eq("user", user)
      .order("created_at", { ascending: false })

    // #region agent log (debug)
    fetch("http://127.0.0.1:7243/ingest/6a43e64c-5eb7-4987-8391-369e0be682d9", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "app/page.tsx:refreshQuests(withUser result)",
        message: "withUser result",
        data: {
          hasError: Boolean(withUser.error),
          error: withUser.error ? supabaseErrorInfo(withUser.error) : null,
          rowCount: Array.isArray(withUser.data) ? withUser.data.length : null,
        },
        timestamp: Date.now(),
      }),
      mode: "no-cors",
      keepalive: true,
    }).catch(() => {})
    // #endregion

    const res =
      withUser.error && isMissingUserColumnError(withUser.error)
        ? await supabase
            .from("quests")
            .select("id, title, description, points, icon, created_at")
            .order("created_at", { ascending: false })
        : withUser

    // #region agent log (debug)
    fetch("http://127.0.0.1:7243/ingest/6a43e64c-5eb7-4987-8391-369e0be682d9", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "C",
        location: "app/page.tsx:refreshQuests(resolved result)",
        message: "resolved result (after fallback if any)",
        data: {
          usedFallback: Boolean(withUser.error && isMissingUserColumnError(withUser.error)),
          hasError: Boolean(res.error),
          error: res.error ? supabaseErrorInfo(res.error) : null,
          rowCount: Array.isArray(res.data) ? res.data.length : null,
        },
        timestamp: Date.now(),
      }),
      mode: "no-cors",
      keepalive: true,
    }).catch(() => {})
    // #endregion

    // user 列が無い場合のエラーは「フォールバック前提」なのでノイズとして出さない
    if (withUser.error && !isMissingUserColumnError(withUser.error)) logSupabaseError("refreshQuests(with user filter)", withUser.error)
    if (res.error) logSupabaseError("refreshQuests", res.error)
    if (!aliveRef.current || res.error || !Array.isArray(res.data)) return

    const next: QuestDefinition[] = res.data.flatMap((r) => {
      const id = String(r.id ?? "")
      const title = typeof r.title === "string" ? r.title : ""
      const description = typeof r.description === "string" ? r.description : ""
      const points = Number(r.points)
      const icon = normalizeQuestIcon(r.icon)
      if (!id || !title || !Number.isFinite(points)) return []
      return [{ id, title, description, points, icon }]
    })
    setQuestDefinitions(next)
  }, [])

  const refreshRewards = useCallback(async (user: ActiveUser) => {
    const supabase = getSupabaseClient()
    if (!supabase) return

    // #region agent log (debug)
    fetch("http://127.0.0.1:7243/ingest/6a43e64c-5eb7-4987-8391-369e0be682d9", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "app/page.tsx:refreshRewards(entry)",
        message: "refreshRewards called",
        data: { user },
        timestamp: Date.now(),
      }),
      mode: "no-cors",
      keepalive: true,
    }).catch(() => {})
    // #endregion

    const withUser = await supabase
      .from("rewards")
      .select("id, title, cost, icon, created_at")
      .eq("user", user)
      .order("created_at", { ascending: false })

    const res =
      withUser.error && isMissingUserColumnError(withUser.error)
        ? await supabase
            .from("rewards")
            .select("id, title, cost, icon, created_at")
            .order("created_at", { ascending: false })
        : withUser

    if (withUser.error && !isMissingUserColumnError(withUser.error)) logSupabaseError("refreshRewards(with user filter)", withUser.error)
    if (res.error) logSupabaseError("refreshRewards", res.error)
    // #region agent log (debug)
    fetch("http://127.0.0.1:7243/ingest/6a43e64c-5eb7-4987-8391-369e0be682d9", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "app/page.tsx:refreshRewards(resolved result)",
        message: "resolved result (after fallback if any)",
        data: {
          usedFallback: Boolean(withUser.error && isMissingUserColumnError(withUser.error)),
          hasError: Boolean(res.error),
          error: res.error ? supabaseErrorInfo(res.error) : null,
          rowCount: Array.isArray(res.data) ? res.data.length : null,
        },
        timestamp: Date.now(),
      }),
      mode: "no-cors",
      keepalive: true,
    }).catch(() => {})
    // #endregion
    if (!aliveRef.current || res.error || !Array.isArray(res.data)) return

    const next: RewardDefinition[] = res.data.flatMap((r) => {
      const id = String(r.id ?? "")
      const title = typeof r.title === "string" ? r.title : ""
      const cost = Number(r.cost)
      const icon = normalizeRewardIcon(r.icon)
      if (!id || !title || !Number.isFinite(cost)) return []
      return [{ id, title, cost, icon }]
    })
    setRewardDefinitions(next)
  }, [])

  const refreshWishes = useCallback(async (user: ActiveUser) => {
    const supabase = getSupabaseClient()
    if (!supabase) return

    const withUser = await supabase
      .from("wishes")
      .select("id, icon, title, completed, created_at")
      .eq("user", user)
      .order("created_at", { ascending: false })

    const res =
      withUser.error && isMissingUserColumnError(withUser.error)
        ? await supabase
            .from("wishes")
            .select("id, icon, title, completed, created_at")
            .order("created_at", { ascending: false })
        : withUser

    if (withUser.error && !isMissingUserColumnError(withUser.error)) logSupabaseError("refreshWishes(with user filter)", withUser.error)
    if (res.error) logSupabaseError("refreshWishes", res.error)
    if (!aliveRef.current || res.error || !Array.isArray(res.data)) return

    const wishItems: WishItem[] = res.data.flatMap((r) => {
      const id = String(r.id ?? "")
      const title = typeof r.title === "string" ? r.title : ""
      const icon = typeof r.icon === "string" && r.icon.length > 0 ? r.icon : "⭐"
      const completed = Boolean(r.completed ?? false)
      const createdAt = typeof r.created_at === "string" ? r.created_at : undefined
      if (!id || !title) return []
      return [{ id, icon, title, completed, createdAt }]
    })
    setWishes(wishItems)
  }, [])

  const refreshPointsFromProfiles = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase) return

    // 初回起動時に profiles が無い/空でも動くように最低限 upsert（行の確保）
    // goal_weight / points など既存データは上書きしない
    // 注意: points を含めると既存データを 0 に上書きしてしまうため、user のみ upsert する
    const up = await supabase.from("profiles").upsert([{ user: "じぃじ" }, { user: "ばぁば" }], { onConflict: "user" })
    if (up.error) console.error("Supabase Error:", up.error)

    const res = await supabase.from("profiles").select("user, points").in("user", USERS)
    if (res.error) console.error("Supabase Error:", res.error)
    if (!aliveRef.current || res.error || !Array.isArray(res.data)) return

    const map = new Map<ActiveUser, number>()
    for (const row of res.data) {
      const u = row?.user
      if (u === "じぃじ" || u === "ばぁば") {
        const p = Number(row?.points ?? 0)
        map.set(u, Number.isFinite(p) ? p : 0)
      }
    }

    setProgressByUser((prev) => ({
      ...prev,
      jiiji: { ...prev.jiiji, points: map.get("じぃじ") ?? prev.jiiji.points },
      baaba: { ...prev.baaba, points: map.get("ばぁば") ?? prev.baaba.points },
    }))
  }, [])

  const saveGoalsForActiveUser = useCallback(
    async (payload: { final_goal_weight?: number | null; period_goal?: PeriodGoal }) => {
      const supabase = getSupabaseClient()
      if (!supabase) return

      const user = activeUser
      const userKey: UserKey = toUserKey(user)

      // 楽観的に即時反映（保存後に再取得して最終同期も行う）
      if (payload.final_goal_weight !== undefined) {
        setFinalGoalWeightByUser((prev) => ({ ...prev, [userKey]: payload.final_goal_weight }))
      }
      if (payload.period_goal) {
        setPeriodGoalByUser((prev) => ({ ...prev, [userKey]: payload.period_goal ?? null }))
      }

      // 外部キー（period_goals.user -> profiles.user）のため、まず profiles 行を確保
      const ensure = await supabase.from("profiles").upsert({ user }, { onConflict: "user" })
      if (ensure.error) console.error("Supabase Error:", ensure.error)

      if (payload.final_goal_weight !== undefined) {
        const r = await supabase
          .from("profiles")
          .upsert({ user, final_goal_weight: payload.final_goal_weight }, { onConflict: "user" })
        if (r.error) console.error("Supabase Error:", r.error)
      }

      if (payload.period_goal) {
        const r = await supabase
          .from("period_goals")
          .upsert(
            {
              user,
              start_date: payload.period_goal.start_date,
              end_date: payload.period_goal.end_date,
              target_weight: payload.period_goal.target_weight,
            },
            { onConflict: "user,start_date,end_date" }
          )
        if (r.error) console.error("Supabase Error:", r.error)
      }

      // 再取得して完全同期（切替時も含めて一貫性を保つ）
      const profileRes = await supabase
        .from("profiles")
        .select("final_goal_weight")
        .eq("user", user)
        .maybeSingle()
      if (profileRes.error) console.error("Supabase Error:", profileRes.error)
      if (!profileRes.error && aliveRef.current) {
        const fg = profileRes.data?.final_goal_weight
        const n = fg == null ? null : Number(fg)
        setFinalGoalWeightByUser((prev) => ({ ...prev, [userKey]: Number.isFinite(n) ? n : null }))
      }

      const todayIso = getLocalISODate(new Date())

      // 直前に保存した期間目標があるなら、それを優先して反映（保存直後にUIが戻らないように）
      type PeriodGoalRow = { start_date?: unknown; end_date?: unknown; target_weight?: unknown }
      let row: PeriodGoalRow | null = null
      if (payload.period_goal) {
        const exactRes = await supabase
          .from("period_goals")
          .select("start_date, end_date, target_weight")
          .eq("user", user)
          .eq("start_date", payload.period_goal.start_date)
          .eq("end_date", payload.period_goal.end_date)
          .maybeSingle()
        if (exactRes.error) console.error("Supabase Error:", exactRes.error)
        row = exactRes.error || !exactRes.data ? null : (exactRes.data as unknown as PeriodGoalRow)
      }

      // 無ければ「現在進行中」のみ（要求仕様: start_date〜end_date の間の1件）
      if (!row) {
        const pgActiveRes = await supabase
          .from("period_goals")
          .select("start_date, end_date, target_weight")
          .eq("user", user)
          .lte("start_date", todayIso)
          .gte("end_date", todayIso)
          .order("end_date", { ascending: true })
          .limit(1)
        if (pgActiveRes.error) console.error("Supabase Error:", pgActiveRes.error)

        row = Array.isArray(pgActiveRes.data) ? (pgActiveRes.data[0] as unknown as PeriodGoalRow) : null
      }

      if (aliveRef.current) {
        const start_date = normalizeISODate(row?.start_date)
        const end_date = normalizeISODate(row?.end_date)
        const target = row?.target_weight == null ? null : Number(row.target_weight)
        setPeriodGoalByUser((prev) => ({
          ...prev,
          [userKey]:
            start_date && end_date
              ? { start_date, end_date, target_weight: Number.isFinite(target) ? target : null }
              : null,
        }))
      }
    },
    [activeUser]
  )

  const applyProfilePointDelta = async (user: ActiveUser, delta: number) => {
    const supabase = getSupabaseClient()
    if (!supabase) return

    // まず行を確保（存在しない場合のため）
    // 注意: points を含めると既存データを 0 に上書きしてしまうため、user のみ upsert する
    const ensure = await supabase.from("profiles").upsert({ user }, { onConflict: "user" })
    if (ensure.error) console.error("Supabase Error:", ensure.error)

    const currentRes = await supabase.from("profiles").select("points").eq("user", user).maybeSingle()
    if (currentRes.error) console.error("Supabase Error:", currentRes.error)
    const current = Number(currentRes.data?.points ?? 0)
    const safeCurrent = Number.isFinite(current) ? current : 0
    const next = Math.max(0, safeCurrent + delta)

    const upd = await supabase.from("profiles").update({ points: next }).eq("user", user)
    if (upd.error) console.error("Supabase Error:", upd.error)
  }

  useEffect(() => {
    async function loadLatest() {
      // 初回レンダ直後/ユーザー切り替え時に最新データを取得
      const user = activeUser
      const userKey: UserKey = toUserKey(user)

      const supabase = getSupabaseClient()
      if (!supabase) {
        // Supabase未設定でもUIを確認できるようにダミーを用意
        setQuestDefinitions(initialQuestDefinitions)
        setRewardDefinitions(initialRewardDefinitions)
        setWishes(initialWishes)
        setQuestHistoryByUser((prev) => ({
          ...prev,
          [userKey]: buildDummyQuestHistory(userKey, 20),
        }))
        setRewardHistoryByUser((prev) => ({
          ...prev,
          [userKey]: buildDummyRewardHistory(userKey, 20),
        }))
        return
      }

      // ポイントは「じぃじ/ばぁば」両方分を常に最新化（固定ヘッダー用）
      await refreshPointsFromProfiles()

      // quests / rewards / wishes（activeUser でフィルタ）
      await refreshQuests(user)
      await refreshRewards(user)
      await refreshWishes(user)

      // profiles から final_goal_weight
      const profileRes = await supabase
        .from("profiles")
        .select("final_goal_weight")
        .eq("user", user)
        .maybeSingle()
      if (profileRes.error) console.error("Supabase Error:", profileRes.error)

      if (aliveRef.current && !profileRes.error) {
        const fgRaw = profileRes.data?.final_goal_weight
        const fg = fgRaw == null ? null : Number(fgRaw)
        setFinalGoalWeightByUser((prev) => ({ ...prev, [userKey]: Number.isFinite(fg) ? fg : null }))
      }

      // period_goals（「現在進行中」優先、無ければ最新）
      const todayIso = getLocalISODate(new Date())
      const pgActiveRes = await supabase
        .from("period_goals")
        .select("start_date, end_date, target_weight")
        .eq("user", user)
        .lte("start_date", todayIso)
        .gte("end_date", todayIso)
        .order("end_date", { ascending: true })
        .limit(1)
      if (pgActiveRes.error) console.error("Supabase Error:", pgActiveRes.error)

      // 読み取りエラーで periodGoal を null に戻すと「入力しても反映されない」に見えるため、
      // period_goals の読み取りが成功したときだけ state を更新する。
      if (aliveRef.current && !pgActiveRes.error) {
        let row = Array.isArray(pgActiveRes.data) ? pgActiveRes.data[0] : null
        let didFetch = true

        if (!row) {
          const pgLatestRes = await supabase
            .from("period_goals")
            .select("start_date, end_date, target_weight")
            .eq("user", user)
            .order("end_date", { ascending: false })
            .limit(1)
          if (pgLatestRes.error) console.error("Supabase Error:", pgLatestRes.error)

          if (pgLatestRes.error) {
            didFetch = false
          } else {
            row = Array.isArray(pgLatestRes.data) ? pgLatestRes.data[0] : null
          }
        }

        if (didFetch) {
          const start_date = normalizeISODate(row?.start_date)
          const end_date = normalizeISODate(row?.end_date)
          const tw = row?.target_weight == null ? null : Number(row.target_weight)
          setPeriodGoalByUser((prev) => ({
            ...prev,
            [userKey]:
              start_date && end_date
                ? { start_date, end_date, target_weight: Number.isFinite(tw) ? tw : null }
                : null,
          }))
        }
      }

      // weights から最新の履歴
      const weightsRes = await supabase
        .from("weights")
        .select("weight, recorded_at")
        .eq("user", user)
        .order("recorded_at", { ascending: true })
      if (weightsRes.error) console.error("Supabase Error:", weightsRes.error)

      if (aliveRef.current && !weightsRes.error && Array.isArray(weightsRes.data)) {
        const next: WeightHistoryItem[] = weightsRes.data
          .flatMap((row) => {
            const iso = normalizeISODate(row.recorded_at)
            const w = Number(row.weight)
            if (!iso || !Number.isFinite(w)) return []
            return [{ isoDate: iso, date: toMDFromISO(iso), weight: w }]
          })
          .sort((a, b) => a.isoDate.localeCompare(b.isoDate))

        setWeightHistoryByUser((prev) => ({ ...prev, [userKey]: next }))
      }

      // quest_history（直近20件）
      const questHistoryRes = await supabase
        .from("quest_history")
        .select("id, title, points, created_at")
        .eq("user", user)
        .order("created_at", { ascending: false })
        .limit(20)
      if (questHistoryRes.error) console.error("Supabase Error:", questHistoryRes.error)

      const questRows = Array.isArray(questHistoryRes.data) ? questHistoryRes.data : []
      const questItems: QuestHistoryItem[] =
        questHistoryRes.error
          ? []
          : questRows.flatMap((r) => {
              const title = typeof r.title === "string" ? r.title : ""
              const points = Number(r.points)
              const occurredAt =
                typeof r.created_at === "string" && r.created_at.length > 0
                  ? r.created_at
                  : new Date().toISOString()
              if (!title || !Number.isFinite(points)) return []
              return [{ id: String(r.id ?? makeId("quest")), title, points, occurredAt }]
            })

      setQuestHistoryByUser((prev) => ({
        ...prev,
        [userKey]: padTo20(questItems, (i) => buildDummyQuestHistoryItem(userKey, i, questItems.length)),
      }))

      // reward_history（直近20件）
      const rewardHistoryRes = await supabase
        .from("reward_history")
        .select("id, title, cost, created_at")
        .eq("user", user)
        .order("created_at", { ascending: false })
        .limit(20)
      if (rewardHistoryRes.error) console.error("Supabase Error:", rewardHistoryRes.error)

      const rewardRows = Array.isArray(rewardHistoryRes.data) ? rewardHistoryRes.data : []
      const rewardItems: RewardHistoryItem[] =
        rewardHistoryRes.error
          ? []
          : rewardRows.flatMap((r) => {
              const title = typeof r.title === "string" ? r.title : ""
              const cost = Number(r.cost)
              const occurredAt =
                typeof r.created_at === "string" && r.created_at.length > 0
                  ? r.created_at
                  : new Date().toISOString()
              if (!title || !Number.isFinite(cost)) return []
              return [{ id: String(r.id ?? makeId("reward")), title, cost, occurredAt }]
            })

      setRewardHistoryByUser((prev) => ({
        ...prev,
        [userKey]: padTo20(rewardItems, (i) => buildDummyRewardHistoryItem(userKey, i, rewardItems.length)),
      }))

    }

    void loadLatest()
  }, [activeUser, refreshPointsFromProfiles, refreshQuests, refreshRewards, refreshWishes])

  const fetchWeightsForRange = useCallback(
    async (startIso: string, endExclusiveIso: string) => {
      const supabase = getSupabaseClient()
      if (!supabase) return []

      const user = activeUser
      const res = await supabase
        .from("weights")
        .select("weight, recorded_at")
        .eq("user", user)
        .gte("recorded_at", startIso)
        .lt("recorded_at", endExclusiveIso)
        .order("recorded_at", { ascending: true })

      if (res.error || !Array.isArray(res.data)) return []

      return res.data
        .flatMap((row) => {
          const iso = normalizeISODate(row.recorded_at)
          const w = Number(row.weight)
          if (!iso || !Number.isFinite(w)) return []
          return [{ isoDate: iso, weight: w }]
        })
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
    },
    [activeUser]
  )

  const handleRecordWeight = async (weight: number, isoDate: string) => {
    const safeIso = isoDate || getLocalISODate(new Date())
    const dateStr = toMDFromISO(safeIso)
    const user = activeUser
    const userKey: UserKey = toUserKey(user)

    // 画面は即時反映（UI維持・体験優先）
    setWeightHistoryByUser((prev) => {
      const newHistory = [...prev[userKey]]
      const idx = newHistory.findIndex((h) => h.isoDate === safeIso)
      if (idx >= 0) {
        newHistory[idx] = { ...newHistory[idx], date: dateStr, weight, isoDate: safeIso }
      } else {
        newHistory.push({ date: dateStr, weight, isoDate: safeIso })
      }
      newHistory.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
      return { ...prev, [userKey]: newHistory }
    })
    // 体重記録ボーナス（activeUser のみ）
    setProgressByUser((prev) => ({
      ...prev,
      [userKey]: { ...prev[userKey], points: prev[userKey].points + 10 },
    }))

    // Supabaseへ永続化（recorded_at は日付指定に対応）
    const supabase = getSupabaseClient()
    if (!supabase) return

    // 同日データがあれば update、なければ insert（ユニーク制約なしでも動く）
    const existingRes = await supabase
      .from("weights")
      .select("id")
      .eq("user", user)
      .eq("recorded_at", safeIso)
      .maybeSingle()
    if (existingRes.error) console.error("Supabase Error:", existingRes.error)

    if (existingRes.data?.id) {
      const upd = await supabase.from("weights").update({ weight }).eq("id", existingRes.data.id)
      if (upd.error) console.error("Supabase Error:", upd.error)
    } else {
      const ins = await supabase.from("weights").insert({ user, weight, recorded_at: safeIso })
      if (ins.error) console.error("Supabase Error:", ins.error)
    }

    // ポイント（profiles）へ反映
    await applyProfilePointDelta(user, 10)
    await refreshPointsFromProfiles()

    const weightsRes = await supabase
      .from("weights")
      .select("weight, recorded_at")
      .eq("user", user)
      .order("recorded_at", { ascending: true })
    if (weightsRes.error) console.error("Supabase Error:", weightsRes.error)

    if (!weightsRes.error && Array.isArray(weightsRes.data)) {
      const next: WeightHistoryItem[] = weightsRes.data
        .flatMap((row) => {
          const iso = normalizeISODate(row.recorded_at)
          const w = Number(row.weight)
          if (!iso || !Number.isFinite(w)) return []
          return [{ isoDate: iso, date: toMDFromISO(iso), weight: w }]
        })
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
      setWeightHistoryByUser((prev) => ({ ...prev, [userKey]: next }))
    }
  }

  const handleCompleteQuest = async (questId: string) => {
    const user = activeUser
    const userKey: UserKey = toUserKey(user)
    const target = questDefinitions.find((q) => q.id === questId)
    if (!target) return
    if (completedQuestIdsByUser[userKey].includes(questId)) return

    // UIは即時反映（ポイントも activeUser のみ増加）
    setQuestHistoryByUser((prevHist) => ({
      ...prevHist,
      [userKey]: [
        {
          id: makeId("quest-local"),
          title: target.title,
          points: target.points,
          occurredAt: new Date().toISOString(),
        },
        ...prevHist[userKey],
      ].slice(0, 20),
    }))

    setCompletedQuestIdsByUser((prev) => ({
      ...prev,
      [userKey]: prev[userKey].includes(questId) ? prev[userKey] : [questId, ...prev[userKey]],
    }))

    setProgressByUser((prevProgress) => {
      const cur = prevProgress[userKey]
      const nextPoints = cur.points + target.points
      const nextLevel = nextPoints >= cur.level * 100 ? cur.level + 1 : cur.level
      return {
        ...prevProgress,
        [userKey]: { ...cur, points: nextPoints, level: nextLevel },
      }
    })

    // Supabaseへ永続化（失敗してもUIは維持）
    const supabase = getSupabaseClient()
    if (!supabase) return
    const ins = await supabase.from("quest_history").insert({ user, title: target.title, points: target.points })
    if (ins.error) console.error("Supabase Error:", ins.error)
    await applyProfilePointDelta(user, target.points)
  }

  const handleRedeemReward = async (rewardId: string) => {
    const reward = rewardDefinitions.find((r) => r.id === rewardId)
    if (reward && points >= reward.cost) {
      setRewardHistoryByUser((prevHist) => ({
        ...prevHist,
        [activeUserKey]: [
          {
            id: makeId("reward-local"),
            title: reward.title,
            cost: reward.cost,
            occurredAt: new Date().toISOString(),
          },
          ...prevHist[activeUserKey],
        ].slice(0, 20),
      }))
      setProgressByUser((prev) => ({
        ...prev,
        [activeUserKey]: { ...prev[activeUserKey], points: prev[activeUserKey].points - reward.cost },
      }))

      // Supabaseへ永続化（activeUser のみ減算）
      const supabase = getSupabaseClient()
      if (!supabase) return
      const ins = await supabase.from("reward_history").insert({ user: activeUser, title: reward.title, cost: reward.cost })
      if (ins.error) console.error("Supabase Error:", ins.error)
      await applyProfilePointDelta(activeUser, -reward.cost)
    }
  }

  const handleToggleWish = (wishId: string) => {
    let nextCompleted: boolean | null = null
    setWishes((prev) => {
      const next = prev.map((w) => {
        if (w.id !== wishId) return w
        nextCompleted = !w.completed
        return { ...w, completed: !w.completed }
      })
      return next
    })

    if (!isUuidLike(wishId)) return
    void (async () => {
      const supabase = getSupabaseClient()
      if (!supabase) return
      if (nextCompleted == null) return
      const user = activeUser

      const withUser = await supabase
        .from("wishes")
        .update({ completed: nextCompleted })
        .eq("id", wishId)
        .eq("user", user)

      if (withUser.error) console.error("Supabase Error:", withUser.error)
      if (withUser.error && isMissingUserColumnError(withUser.error)) {
        const fallback = await supabase.from("wishes").update({ completed: nextCompleted }).eq("id", wishId)
        if (fallback.error) console.error("Supabase Error:", fallback.error)
      }

      // 成功直後に再取得して完全同期
      await refreshWishes(user)
    })()
  }

  const handleCreateWish = useCallback(
    async ({ icon, title }: { icon: string; title: string }) => {
      const safeTitle = title.trim()
      if (!safeTitle) return
      const safeIcon = icon.trim() || "⭐"

      const supabase = getSupabaseClient()
      if (!supabase) {
        setWishes((prev) => [{ id: makeId("wish-local"), icon: safeIcon, title: safeTitle, completed: false }, ...prev])
        return
      }

      const user = activeUser

      const insWithUser = await supabase
        .from("wishes")
        .insert({ user, icon: safeIcon, title: safeTitle, completed: false })
        .select("id")
        .single()

      const ins =
        insWithUser.error && isMissingUserColumnError(insWithUser.error)
          ? await supabase.from("wishes").insert({ icon: safeIcon, title: safeTitle, completed: false }).select("id").single()
          : insWithUser

      if (insWithUser.error) console.error("Supabase Error:", insWithUser.error)
      if (ins.error) console.error("Supabase Error:", ins.error)
      if (!aliveRef.current) return

      if (!ins.error && ins.data) {
        // 成功直後に再取得して完全同期（UUID差し替え/並び順も含めてDBが正）
        await refreshWishes(user)
        return
      }

      // 失敗時もUIが止まらないようローカル追加（Supabase未作成/権限不足などを想定）
      setWishes((prev) => [{ id: makeId("wish-local"), icon: safeIcon, title: safeTitle, completed: false }, ...prev])
    },
    [activeUser, refreshWishes]
  )

  const handleCreateQuest = useCallback(
    async (payload: { title: string; description: string; points: number; icon: QuestIcon }) => {
      const title = payload.title.trim()
      if (!title) return
      const description = payload.description.trim()
      const points = Math.max(0, Number(payload.points))
      const icon = payload.icon

      const supabase = getSupabaseClient()
      if (!supabase) {
        setQuestDefinitions((prev) => [{ id: makeId("quest-local"), title, description, points, icon }, ...prev])
        return
      }

      const user = activeUser

      const insWithUser = await supabase
        .from("quests")
        .insert({ user, title, description, points, icon })
        .select("id")
        .single()

      const ins =
        insWithUser.error && isMissingUserColumnError(insWithUser.error)
          ? await supabase.from("quests").insert({ title, description, points, icon }).select("id").single()
          : insWithUser

      if (insWithUser.error) console.error("Supabase Error:", insWithUser.error)
      if (ins.error) console.error("Supabase Error:", ins.error)
      if (!aliveRef.current) return

      if (!ins.error && ins.data) {
        await refreshQuests(user)
      } else {
        setQuestDefinitions((prev) => [{ id: makeId("quest-local"), title, description, points, icon }, ...prev])
      }
    },
    [activeUser, refreshQuests]
  )

  const handleUpdateQuest = useCallback(
    async (questId: string, payload: { title: string; description: string; points: number; icon: QuestIcon }) => {
      const title = payload.title.trim()
      if (!title) return
      const description = payload.description.trim()
      const points = Math.max(0, Number(payload.points))
      const icon = payload.icon

      // UIは即時反映
      setQuestDefinitions((prev) =>
        prev.map((q) => (q.id === questId ? { ...q, title, description, points, icon } : q))
      )

      const supabase = getSupabaseClient()
      if (!supabase) return

      const user = activeUser

      // UUIDでなければ「既存DB行」ではない可能性が高いので、insert扱いにする
      if (!isUuidLike(questId)) {
        const insWithUser = await supabase.from("quests").insert({ user, title, description, points, icon }).select("id").single()
        const ins =
          insWithUser.error && isMissingUserColumnError(insWithUser.error)
            ? await supabase.from("quests").insert({ title, description, points, icon }).select("id").single()
            : insWithUser

        if (insWithUser.error) console.error("Supabase Error:", insWithUser.error)
        if (ins.error) console.error("Supabase Error:", ins.error)
        if (!ins.error) {
          await refreshQuests(user)
        }
        return
      }

      const updWithUser = await supabase
        .from("quests")
        .update({ title, description, points, icon })
        .eq("id", questId)
        .eq("user", user)
        .select("id")
        .maybeSingle()

      if (updWithUser.error) console.error("Supabase Error:", updWithUser.error)
      if (updWithUser.error && isMissingUserColumnError(updWithUser.error)) {
        const fallback = await supabase.from("quests").update({ title, description, points, icon }).eq("id", questId)
        if (fallback.error) console.error("Supabase Error:", fallback.error)
      }

      await refreshQuests(user)
    },
    [activeUser, refreshQuests]
  )

  const handleDeleteQuest = useCallback(async (questId: string) => {
    // UIは即時反映
    setQuestDefinitions((prev) => prev.filter((q) => q.id !== questId))
    setCompletedQuestIdsByUser((prev) => ({
      jiiji: prev.jiiji.filter((id) => id !== questId),
      baaba: prev.baaba.filter((id) => id !== questId),
    }))

    const supabase = getSupabaseClient()
    if (!supabase) return

    const user = activeUser
    if (isUuidLike(questId)) {
      const delWithUser = await supabase.from("quests").delete().eq("id", questId).eq("user", user)
      if (delWithUser.error) console.error("Supabase Error:", delWithUser.error)
      if (delWithUser.error && isMissingUserColumnError(delWithUser.error)) {
        const fallback = await supabase.from("quests").delete().eq("id", questId)
        if (fallback.error) console.error("Supabase Error:", fallback.error)
      }
    }

    await refreshQuests(user)
  }, [activeUser, refreshQuests])

  const handleCreateReward = useCallback(
    async (payload: { title: string; cost: number; icon: RewardIcon }) => {
      const title = payload.title.trim()
      if (!title) return
      const cost = Math.max(0, Number(payload.cost))
      const icon = payload.icon

      const supabase = getSupabaseClient()
      if (!supabase) {
        setRewardDefinitions((prev) => [{ id: makeId("reward-local"), title, cost, icon }, ...prev])
        return
      }

      const user = activeUser

      const insWithUser = await supabase
        .from("rewards")
        .insert({ user, title, cost, icon })
        .select("id")
        .single()

      const ins =
        insWithUser.error && isMissingUserColumnError(insWithUser.error)
          ? await supabase.from("rewards").insert({ title, cost, icon }).select("id").single()
          : insWithUser

      // user列が無い場合はフォールバック前提なのでエラーとしては扱わない
      if (insWithUser.error && !isMissingUserColumnError(insWithUser.error)) {
        logSupabaseError("handleCreateReward(insert with user)", insWithUser.error)
      }
      if (ins.error) logSupabaseError("handleCreateReward", ins.error)
      if (!aliveRef.current) return
      if (!ins.error && ins.data) {
        await refreshRewards(user)
      } else {
        setRewardDefinitions((prev) => [{ id: makeId("reward-local"), title, cost, icon }, ...prev])
      }
    },
    [activeUser, refreshRewards]
  )

  const handleUpdateReward = useCallback(
    async (rewardId: string, payload: { title: string; cost: number; icon: RewardIcon }) => {
      const title = payload.title.trim()
      if (!title) return
      const cost = Math.max(0, Number(payload.cost))
      const icon = payload.icon

      // UIは即時反映
      setRewardDefinitions((prev) => prev.map((r) => (r.id === rewardId ? { ...r, title, cost, icon } : r)))

      const supabase = getSupabaseClient()
      if (!supabase) return

      const user = activeUser

      if (!isUuidLike(rewardId)) {
        const insWithUser = await supabase.from("rewards").insert({ user, title, cost, icon }).select("id").single()
        const ins =
          insWithUser.error && isMissingUserColumnError(insWithUser.error)
            ? await supabase.from("rewards").insert({ title, cost, icon }).select("id").single()
            : insWithUser
        if (insWithUser.error && !isMissingUserColumnError(insWithUser.error)) {
          logSupabaseError("handleUpdateReward(insert with user; non-uuid id)", insWithUser.error)
        }
        if (ins.error) logSupabaseError("handleUpdateReward(insert; non-uuid id)", ins.error)
        if (!ins.error) {
          await refreshRewards(user)
        }
        return
      }

      const updWithUser = await supabase
        .from("rewards")
        .update({ title, cost, icon })
        .eq("id", rewardId)
        .eq("user", user)
        .select("id")
        .maybeSingle()

      // user列が無い場合はフォールバックへ（このエラー自体は想定内なのでconsole.errorには出さない）
      if (updWithUser.error && isMissingUserColumnError(updWithUser.error)) {
        const fallback = await supabase.from("rewards").update({ title, cost, icon }).eq("id", rewardId)
        if (fallback.error) logSupabaseError("handleUpdateReward(update fallback)", fallback.error)
      } else if (updWithUser.error) {
        logSupabaseError("handleUpdateReward(update with user)", updWithUser.error)
      }

      await refreshRewards(user)
    },
    [activeUser, refreshRewards]
  )

  const handleDeleteReward = useCallback(async (rewardId: string) => {
    // UIは即時反映
    setRewardDefinitions((prev) => prev.filter((r) => r.id !== rewardId))

    const supabase = getSupabaseClient()
    if (!supabase) return

    const user = activeUser
    if (isUuidLike(rewardId)) {
      const delWithUser = await supabase.from("rewards").delete().eq("id", rewardId).eq("user", user)
      if (delWithUser.error && isMissingUserColumnError(delWithUser.error)) {
        const fallback = await supabase.from("rewards").delete().eq("id", rewardId)
        if (fallback.error) logSupabaseError("handleDeleteReward(delete fallback)", fallback.error)
      } else if (delWithUser.error) {
        logSupabaseError("handleDeleteReward(delete with user)", delWithUser.error)
      }
    }

    await refreshRewards(user)
  }, [activeUser, refreshRewards])

  const handleUpdateWish = useCallback(async (wishId: string, payload: { icon: string; title: string }) => {
    const title = payload.title.trim()
    if (!title) return
    const icon = payload.icon.trim() || "⭐"

    // UIは即時反映
    setWishes((prev) => prev.map((w) => (w.id === wishId ? { ...w, title, icon } : w)))

    const supabase = getSupabaseClient()
    if (!supabase) return

    const user = activeUser
    if (!isUuidLike(wishId)) {
      const insWithUser = await supabase.from("wishes").insert({ user, title, icon, completed: false }).select("id").single()
      const ins =
        insWithUser.error && isMissingUserColumnError(insWithUser.error)
          ? await supabase.from("wishes").insert({ title, icon, completed: false }).select("id").single()
          : insWithUser
      if (insWithUser.error) console.error("Supabase Error:", insWithUser.error)
      if (ins.error) console.error("Supabase Error:", ins.error)
      if (!ins.error) {
        await refreshWishes(user)
      }
      return
    }

    const updWithUser = await supabase.from("wishes").update({ title, icon }).eq("id", wishId).eq("user", user)
    if (updWithUser.error) console.error("Supabase Error:", updWithUser.error)
    if (updWithUser.error && isMissingUserColumnError(updWithUser.error)) {
      const fallback = await supabase.from("wishes").update({ title, icon }).eq("id", wishId)
      if (fallback.error) console.error("Supabase Error:", fallback.error)
    }

    await refreshWishes(user)
  }, [activeUser, refreshWishes])

  const handleDeleteWish = useCallback(async (wishId: string) => {
    // UIは即時反映
    setWishes((prev) => prev.filter((w) => w.id !== wishId))

    const supabase = getSupabaseClient()
    if (!supabase) return

    const user = activeUser
    if (isUuidLike(wishId)) {
      const delWithUser = await supabase.from("wishes").delete().eq("id", wishId).eq("user", user)
      if (delWithUser.error) console.error("Supabase Error:", delWithUser.error)
      if (delWithUser.error && isMissingUserColumnError(delWithUser.error)) {
        const fallback = await supabase.from("wishes").delete().eq("id", wishId)
        if (fallback.error) console.error("Supabase Error:", fallback.error)
      }
    }

    await refreshWishes(user)
  }, [activeUser, refreshWishes])

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab)
      const supabase = getSupabaseClient()
      if (!supabase) return
      const user = activeUser
      if (tab === "quest") void refreshQuests(user)
      if (tab === "reward") void refreshRewards(user)
      if (tab === "dream") void refreshWishes(user)
    },
    [activeUser, refreshQuests, refreshRewards, refreshWishes]
  )

  return (
    <div className="min-h-dvh bg-background pb-[calc(80px+env(safe-area-inset-bottom))]">
      {/* ヘッダー */}
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b-2 backdrop-blur-md ${
          activeUser === "じぃじ"
            ? "border-teal-900/15 bg-gradient-to-b from-teal-600/95 to-teal-500/85 dark:border-teal-900/35 dark:from-teal-950/55 dark:to-teal-900/45"
            : "border-orange-900/15 bg-gradient-to-b from-orange-500/95 via-orange-400/85 to-orange-300/70 dark:border-orange-900/35 dark:from-orange-950/55 dark:via-orange-900/45 dark:to-orange-900/30"
        }`}
      >
        <div className="mx-auto w-full max-w-md px-4 pb-3 pt-[calc(10px+env(safe-area-inset-top))]">
          <h1 className="text-center text-xl font-bold text-white drop-shadow-sm">
            {activeTab === "home" && "ホーム"}
            {activeTab === "quest" && "クエスト"}
            {activeTab === "reward" && "ごほうび"}
            {activeTab === "dream" && "やりたいこと"}
          </h1>

          {/* ポイントヘッダー（全画面共通・固定） */}
          <div className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/80 px-3 py-2 text-sm font-bold shadow-sm dark:border-white/10 dark:bg-black/15">
            <span
              className={
                activeUser === "じぃじ" ? "text-teal-800 dark:text-teal-200" : "text-muted-foreground"
              }
            >
              じぃじ: {progressByUser.jiiji.points}pt
            </span>
            <span className="text-muted-foreground">/</span>
            <span
              className={
                activeUser === "ばぁば" ? "text-orange-800 dark:text-orange-200" : "text-muted-foreground"
              }
            >
              ばぁば: {progressByUser.baaba.points}pt
            </span>
          </div>

          {/* じぃじ/ばぁば 切り替え */}
          <div className="mt-2 flex rounded-2xl border border-white/35 bg-white/80 p-1 shadow-sm dark:border-white/10 dark:bg-black/15">
            <Button
              type="button"
              variant="ghost"
              className={`flex-1 rounded-xl py-3 text-base font-bold transition-all ${
                activeUser === "じぃじ"
                  ? "bg-teal-700 text-white shadow-sm hover:bg-teal-800"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveUser("じぃじ")}
              aria-pressed={activeUser === "じぃじ"}
            >
              じぃじ
            </Button>
            <div className="flex items-center px-1 text-sm font-bold text-muted-foreground">
              ⇄
            </div>
            <Button
              type="button"
              variant="ghost"
              className={`flex-1 rounded-xl py-3 text-base font-bold transition-all ${
                activeUser === "ばぁば"
                  ? "bg-orange-600 text-white shadow-sm hover:bg-orange-700"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveUser("ばぁば")}
              aria-pressed={activeUser === "ばぁば"}
            >
              ばぁば
            </Button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="mx-auto w-full max-w-md pt-[calc(150px+env(safe-area-inset-top))]">
        {activeTab === "home" && (
          <HomeView
            currentWeight={currentWeight}
            finalGoalWeight={finalGoalWeight}
            periodGoal={periodGoal}
            weightHistory={weightHistory}
            onRecordWeight={handleRecordWeight}
            onFetchWeightsForRange={fetchWeightsForRange}
            onSaveGoals={saveGoalsForActiveUser}
          />
        )}
        {activeTab === "quest" && (
          <QuestView
            activeUser={activeUser}
            points={points}
            refreshPoints={refreshPointsFromProfiles}
            quests={questDefinitions}
            completedQuestIds={completedQuestIdsByUser[activeUserKey]}
            onCompleteQuest={handleCompleteQuest}
            onCreateQuest={handleCreateQuest}
            onUpdateQuest={handleUpdateQuest}
            onDeleteQuest={handleDeleteQuest}
            history={questHistory}
          />
        )}
        {activeTab === "reward" && (
          <RewardView
            activeUser={activeUser}
            rewards={rewardDefinitions}
            points={points}
            refreshPoints={refreshPointsFromProfiles}
            onRedeem={handleRedeemReward}
            onCreateReward={handleCreateReward}
            onUpdateReward={handleUpdateReward}
            onDeleteReward={handleDeleteReward}
            history={rewardHistory}
          />
        )}
        {activeTab === "dream" && (
          <DreamView
            activeUser={activeUser}
            wishes={wishes}
            onToggleWish={handleToggleWish}
            onCreateWish={handleCreateWish}
            onUpdateWish={handleUpdateWish}
            onDeleteWish={handleDeleteWish}
          />
        )}
      </main>

      {/* ボトムナビゲーション */}
      <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  )
}

function getLocalISODate(d: Date) {
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function toMDFromISO(iso: string) {
  // iso: YYYY-MM-DD
  const [, m, d] = iso.split("-")
  const mm = Number(m)
  const dd = Number(d)
  if (!Number.isFinite(mm) || !Number.isFinite(dd)) return iso
  return `${mm}/${dd}`
}

function normalizeISODate(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0) return null
  // date でも timestamptz でも先頭10文字を YYYY-MM-DD として扱う
  const iso = input.slice(0, 10)
  // 簡易バリデーション
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  return iso
}

function normalizeQuestIcon(input: unknown): QuestIcon {
  switch (input) {
    case "walk":
    case "alcohol":
    case "food":
    case "sleep":
    case "exercise":
      return input
    default:
      return "walk"
  }
}

function normalizeRewardIcon(input: unknown): RewardIcon {
  switch (input) {
    case "beer":
    case "snack":
    case "call":
    case "coffee":
    case "tv":
    case "shopping":
      return input
    default:
      return "coffee"
  }
}
