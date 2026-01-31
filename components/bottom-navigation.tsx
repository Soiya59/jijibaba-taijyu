"use client"

import { Home, Swords, Gift, Star } from "lucide-react"

type Tab = "home" | "quest" | "reward" | "dream"

interface BottomNavigationProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const tabs = [
  { id: "home" as const, label: "ホーム", icon: Home },
  { id: "quest" as const, label: "クエスト", icon: Swords },
  { id: "reward" as const, label: "ごほうび", icon: Gift },
  { id: "dream" as const, label: "やりたいこと", icon: Star },
]

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] border-t-2 border-border/50 bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-all ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className={`flex size-10 items-center justify-center rounded-xl transition-all ${
                  isActive ? "bg-primary/15" : ""
                }`}
              >
                <Icon
                  className={`size-6 transition-transform ${
                    isActive ? "scale-110" : ""
                  }`}
                  fill={isActive ? "currentColor" : "none"}
                />
              </div>
              <span
                className={`text-xs font-medium ${
                  isActive ? "font-bold" : ""
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
      {/* Safe area for iPhone */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
