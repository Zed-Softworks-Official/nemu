'use client'

import { api, useConvexAuth, useQuery } from '@nemu/cloud'
import {
    getRememberedBaseUrl,
    getRememberedControllerId,
    isSelfSignedLanUrl,
    lanUrlsFromHostnames,
    setRememberedBaseUrl,
    useController,
} from '@nemu/controller'
import { Button } from '@nemu/ui/components/button'
import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from '@nemu/ui/components/popover'
import { Loader2, LockKeyholeOpen } from 'lucide-react'
import { useMemo, useState } from 'react'

export function FixInsecureLanButton({
    align = 'end',
}: {
    align?: 'start' | 'center' | 'end'
}) {
    const { connection, reprobe, status } = useController()
    const { isAuthenticated } = useConvexAuth()
    const controllers = useQuery(
        api.controllers.listMine,
        isAuthenticated ? {} : 'skip'
    )
    const [busy, setBusy] = useState(false)
    const [didFix, setDidFix] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const currentUrl = status.baseUrl ?? getRememberedBaseUrl()
    const usingSelfSigned = Boolean(
        currentUrl && isSelfSignedLanUrl(currentUrl)
    )

    const controllerId =
        status.controllerId ?? getRememberedControllerId() ?? undefined
    const trustedUrl = useMemo(() => {
        if (!controllers?.length) return undefined
        const match =
            (controllerId
                ? controllers.find((row) => row.controllerId === controllerId)
                : undefined) ?? controllers[0]
        const hostname = match?.lanHostname
        if (!hostname?.endsWith('.lan.nemu.sh')) return undefined
        return lanUrlsFromHostnames([hostname])[0]
    }, [controllerId, controllers])

    if (!usingSelfSigned && !didFix) return null

    async function onFix() {
        if (!trustedUrl) return
        setBusy(true)
        setError(null)
        try {
            setRememberedBaseUrl(trustedUrl)
            await reprobe()
            const next = connection.getStatus()
            const nextUrl = next.baseUrl?.replace(/\/$/, '')
            if (next.mode === 'lan' && nextUrl === trustedUrl) {
                setDidFix(true)
                return
            }
            setError(
                "Couldn't reach the trusted address. Stay on this network and try again."
            )
        } catch {
            setError(
                "Couldn't reach the trusted address. Stay on this network and try again."
            )
        } finally {
            setBusy(false)
        }
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    aria-label="Fix not secure connection"
                    className="text-muted-foreground"
                    size="icon-sm"
                    variant="ghost"
                >
                    <LockKeyholeOpen />
                </Button>
            </PopoverTrigger>
            <PopoverContent align={align} className="w-80">
                <PopoverHeader>
                    <PopoverTitle>Fix not secure connection</PopoverTitle>
                    {didFix ? (
                        <PopoverDescription>
                            Chrome may keep showing Not secure until you open a
                            new dashboard tab.
                        </PopoverDescription>
                    ) : trustedUrl ? (
                        <PopoverDescription>
                            This dashboard is using nemu.local, which uses a
                            self-signed certificate, so Chrome marks the page
                            Not secure. Switch to the trusted address issued for
                            this controller.
                        </PopoverDescription>
                    ) : (
                        <PopoverDescription>
                            This dashboard is using nemu.local, which uses a
                            self-signed certificate. A trusted address is not
                            ready yet.
                        </PopoverDescription>
                    )}
                </PopoverHeader>
                {error ? (
                    <p className="text-destructive text-xs">{error}</p>
                ) : null}
                {didFix ? (
                    <Button
                        onClick={() =>
                            window.open(window.location.href, '_blank')
                        }
                        variant="outline"
                    >
                        Open new tab
                    </Button>
                ) : (
                    <Button
                        disabled={!trustedUrl || busy}
                        onClick={() => void onFix()}
                    >
                        {busy ? (
                            <Loader2
                                className="animate-spin"
                                data-icon="inline-start"
                            />
                        ) : null}
                        Use trusted connection
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    )
}
