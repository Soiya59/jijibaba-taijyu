"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Delete } from "lucide-react"

interface NumpadInputProps {
  initialValue: number
  onSubmit: (value: number) => void
  onCancel: () => void
}

export function NumpadInput({ initialValue, onSubmit, onCancel }: NumpadInputProps) {
  const [display, setDisplay] = useState(initialValue.toFixed(1))
  const [hasDecimal, setHasDecimal] = useState(true)

  const handleNumber = (num: string) => {
    if (display === "0" || display === initialValue.toFixed(1)) {
      setDisplay(num)
      setHasDecimal(false)
    } else if (display.length < 6) {
      setDisplay(display + num)
    }
  }

  const handleDecimal = () => {
    if (!hasDecimal) {
      setDisplay(display + ".")
      setHasDecimal(true)
    }
  }

  const handleDelete = () => {
    if (display.length > 1) {
      const newDisplay = display.slice(0, -1)
      if (!newDisplay.includes(".")) {
        setHasDecimal(false)
      }
      setDisplay(newDisplay)
    } else {
      setDisplay("0")
      setHasDecimal(false)
    }
  }

  const handleSubmit = () => {
    const value = parseFloat(display)
    if (!isNaN(value) && value > 0) {
      onSubmit(value)
    }
  }

  const numpadButtons = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
    [".", "0", "delete"],
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* 表示部分 */}
      <div className="rounded-2xl bg-secondary p-4">
        <div className="text-right">
          <span className="text-4xl font-bold text-foreground">{display}</span>
          <span className="ml-1 text-2xl text-muted-foreground">kg</span>
        </div>
      </div>

      {/* 数字パッド */}
      <div className="grid grid-cols-3 gap-2">
        {numpadButtons.flat().map((btn, index) => {
          if (btn === "delete") {
            return (
              <Button
                key={index}
                variant="secondary"
                className="h-14 rounded-xl text-xl font-bold"
                onClick={handleDelete}
              >
                <Delete className="size-6" />
              </Button>
            )
          }
          if (btn === ".") {
            return (
              <Button
                key={index}
                variant="secondary"
                className="h-14 rounded-xl text-2xl font-bold"
                onClick={handleDecimal}
                disabled={hasDecimal}
              >
                .
              </Button>
            )
          }
          return (
            <Button
              key={index}
              variant="secondary"
              className="h-14 rounded-xl text-2xl font-bold transition-colors hover:bg-primary/20"
              onClick={() => handleNumber(btn)}
            >
              {btn}
            </Button>
          )
        })}
      </div>

      {/* 決定ボタン */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 h-14 rounded-xl text-lg font-bold bg-transparent"
          onClick={onCancel}
        >
          キャンセル
        </Button>
        <Button
          className="flex-1 h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground"
          onClick={handleSubmit}
        >
          決定
        </Button>
      </div>
    </div>
  )
}
