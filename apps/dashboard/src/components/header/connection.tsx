'use client'

import { Badge } from '@nemu/ui/components/badge'
import { House, WifiIcon, WifiOff } from 'lucide-react'
import { useMemo, useState } from 'react'

type ConnectionData = {
    type: 'lan' | 'relay' | 'none'
    label: string
    icon: React.ReactNode
    variant: 'soft' | 'warning-soft' | 'destructive'
}

export function ConnectionBadge() {
    const [connection] = useState<'lan' | 'relay' | 'none'>('lan')

    const connectionData = useMemo<ConnectionData>(() => {
        switch (connection) {
            case 'lan':
                return {
                    type: 'lan',
                    label: 'LAN',
                    icon: <House className="size-4" />,
                    variant: 'soft',
                }
            case 'relay':
                return {
                    type: 'relay',
                    label: 'Relay',
                    icon: <WifiIcon className="size-4" />,
                    variant: 'warning-soft',
                }
            case 'none':
                return {
                    type: 'none',
                    label: 'No connection',
                    icon: <WifiOff className="size-4" />,
                    variant: 'destructive',
                }
        }
    }, [connection])

    return (
        <Badge variant={connectionData.variant}>
            {connectionData.icon}
            {connectionData.label}
        </Badge>
    )
}
