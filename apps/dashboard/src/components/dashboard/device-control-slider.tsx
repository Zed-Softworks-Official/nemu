'use client'

import { Slider } from '@nemu/ui/components/slider'
import { useEffect, useRef, useState } from 'react'

type DeviceControlSliderProps = {
    value: number
    min: number
    max: number
    step?: number
    disabled?: boolean
    /** When true, only commit on pointer/keyboard release (remote mode). */
    commitOnRelease: boolean
    ariaLabel: string
    onCommit: (value: number) => void
    formatValue?: (value: number) => string
    label: string
}

export function DeviceControlSlider({
    value,
    min,
    max,
    step = 1,
    disabled,
    commitOnRelease,
    ariaLabel,
    onCommit,
    formatValue = String,
    label,
}: DeviceControlSliderProps) {
    const [draft, setDraft] = useState(value)
    const draftRef = useRef(draft)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const draggingRef = useRef(false)

    useEffect(() => {
        if (!draggingRef.current) {
            setDraft(value)
            draftRef.current = value
        }
    }, [value])

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    function scheduleCommit(next: number) {
        if (commitOnRelease) return
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            onCommit(next)
        }, 120)
    }

    function commitNow() {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
        }
        onCommit(draftRef.current)
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground">
                    {formatValue(draft)}
                </span>
            </div>
            <Slider
                aria-label={ariaLabel}
                disabled={disabled}
                max={max}
                min={min}
                onValueChange={(next) => {
                    const resolved = next[0] ?? min
                    draggingRef.current = true
                    draftRef.current = resolved
                    setDraft(resolved)
                    scheduleCommit(resolved)
                }}
                onValueCommit={() => {
                    draggingRef.current = false
                    if (commitOnRelease) {
                        commitNow()
                    }
                }}
                step={step}
                value={[draft]}
            />
        </div>
    )
}
