'use client'

import Link from 'next/link'
import { useState } from 'react'

export enum ButtonStyle {
    Info = 'bg-primary hover:bg-primarylight',
    Error = 'bg-error'
}

export default function Button({
    label,
    icon,
    action,
    href,
    style,
    type,
    download = false
}: {
    label: string
    icon: React.JSX.Element
    action?: () => void
    href?: string
    style?: ButtonStyle
    type?: 'button' | 'submit' | 'reset' | undefined,
    download?: boolean
}) {
    const [buttonStyle, setButtonStyle] = useState(style ? style : ButtonStyle.Info)

    // If it's a action button we render an html button
    if (!href) {
        return (
            <button
                type={type ? type : 'button'}
                onClick={action}
                className={`btn btn-primary btn-lg text-white`}
            >
                {icon}
                {label}
            </button>
        )
    }

    return (
        <Link
            href={href!}
            className={`btn btn-primary text-white`}
            download={download}
        >
            {icon}
            {label}
        </Link>
    )
}
