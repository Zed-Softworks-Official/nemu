'use client'

import { discoverController, useController } from '@nemu/controller'
import { useEffect, useState } from 'react'

export function HealthCheck() {
    const { status } = useController()
    const [health, setHealth] = useState<string>('')

    useEffect(() => {
        void discoverController().then((result) => {
            setHealth(result?.health.status ?? 'unknown')
        })
    }, [])

    return (
        <div className="flex flex-col">
            <p className="text-sm text-muted-foreground">{status.mode}</p>
            <p className="text-sm text-muted-foreground">{health}</p>
        </div>
    )
}
