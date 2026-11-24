import { useRef } from 'react'

export type NativeSliderProps = {
    /** Spoken name of the slider; no visible label is drawn. */
    label: string
    /** Spoken value, such as "2700 K". */
    valueText: string
    value: number
    min: number
    max: number
    disabled: boolean
    /** Leave the track unpainted, for one drawn behind the slider. */
    clearTrack: boolean
    /** Called as the thumb moves. */
    onValueChange: (value: number) => void
    /** Called once when a drag that moved the thumb ends. */
    onRelease: (value: number) => void
}

/**
 * A slider that says when it is let go. iOS uses a SwiftUI Slider and Android
 * a Compose Slider (the `.ios` and `.android` files); this range input is the
 * web fallback and the stand-in under Jest.
 */
export function NativeSlider({
    label,
    valueText,
    value,
    min,
    max,
    disabled,
    clearTrack,
    onValueChange,
    onRelease,
}: NativeSliderProps) {
    const latest = useRef<number | null>(null)

    function release() {
        const released = latest.current
        latest.current = null
        if (released !== null && !disabled) onRelease(released)
    }

    return (
        <input
            aria-label={label}
            aria-valuetext={valueText}
            disabled={disabled}
            max={max}
            min={min}
            onBlur={release}
            onChange={(event) => {
                if (disabled) return
                latest.current = Number(event.currentTarget.value)
                onValueChange(latest.current)
            }}
            onKeyUp={release}
            onPointerUp={release}
            step="any"
            style={{
                width: '100%',
                height: 44,
                margin: 0,
                ...(clearTrack
                    ? { appearance: 'none', background: 'transparent' }
                    : null),
            }}
            type="range"
            value={value}
        />
    )
}
