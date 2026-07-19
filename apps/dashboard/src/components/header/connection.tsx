'use client'

import { useController } from '@nemu/controller'
import type { ConnectionStatus } from '@nemu/protocol'
import { Badge } from '@nemu/ui/components/badge'
import { House, Loader2, WifiIcon, WifiOff } from 'lucide-react'
import { useMemo } from 'react'

type ConnectionData = {
    status: ConnectionStatus
    icon: React.ReactNode
    variant: 'soft' | 'warning-soft' | 'destructive' | 'ghost'
}

export function ConnectionBadge() {
    const { status } = useController()

    const connectionData = useMemo<ConnectionData>(() => {
        switch (status.mode) {
            case 'lan':
                return {
                    status,
                    icon: <House className="size-4" />,
                    variant: 'soft',
                }
            case 'relay':
                return {
                    status,
                    icon: <WifiIcon className="size-4" />,
                    variant: 'warning-soft',
                }
            case 'probing':
                return {
                    status,
                    icon: <Loader2 className="size-4 animate-spine" />,
                    variant: 'ghost',
                }
            case 'offline':
                return {
                    status,
                    icon: <WifiOff className="size-4" />,
                    variant: 'destructive',
                }
        }
    }, [status])

    return (
        <Badge variant={connectionData.variant}>
            {connectionData.icon}
            {connectionData.status.label}
        </Badge>
    )
}
