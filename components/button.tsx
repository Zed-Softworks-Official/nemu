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
                className={`${buttonStyle} p-5 block w-full rounded-xl text-center`}
            >
                {icon}
                {label}
            </button>
        )
    }

    return (
        <Link
            href={href!}
            className={`${buttonStyle} p-5 block w-full rounded-xl text-center`}
            download={download}
        >
            {icon}
            {label}
        </Link>
    )
}
