'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import { api, useMutation, useQuery } from '@nemu/cloud'
import {
    buildTlsTrustUrl,
    discoverController,
    getClientToken,
    getRememberedBaseUrl,
    getRememberedControllerId,
    identifyController,
    isLanControllerOrigin,
    lanDiscoveryCandidates,
    lanUrlsFromHostnames,
    pairWithController,
    TLS_TRUSTED_MESSAGE,
    useController,
} from '@nemu/controller'
import { ApiError } from '@nemu/protocol'
import { Button } from '@nemu/ui/components/button'
import { Input } from '@nemu/ui/components/input'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Phase = 'discover' | 'pair' | 'saving' | 'done'

const CONVEX_PAIR_TIMEOUT_MS = 15_000

function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new Error(message))
        }, ms)
        promise.then(
            (value) => {
                window.clearTimeout(timer)
                resolve(value)
            },
            (err: unknown) => {
                window.clearTimeout(timer)
                reject(err)
            }
        )
    })
}

function formatPairingError(err: unknown): string {
    if (err instanceof ApiError && err.code === 'invalid_code') {
        return 'This pairing code was already used or expired. Get a new 6-digit code from the controller — restart it if no clients are paired yet, or mint one from Settings.'
    }
    if (err instanceof Error) return err.message
    return 'Pairing failed'
}

export default function SetupPage() {
    const router = useRouter()
    const { reprobe } = useController()
    const { isSignedIn } = useAuth()
    const { user } = useUser()
    const createPairing = useMutation(api.pairings.create)
    const mine = useQuery(api.controllers.listMine, isSignedIn ? {} : 'skip')
    const issuedUrls = useMemo(
        () => lanUrlsFromHostnames((mine ?? []).map((row) => row.lanHostname)),
        [mine]
    )
    const hasIssuedHostname = issuedUrls.length > 0

    const [phase, setPhase] = useState<Phase>('discover')
    const [baseUrl, setBaseUrl] = useState('http://localhost:6368')
    const [manualUrl, setManualUrl] = useState('')
    const [controllerName, setControllerName] = useState<string | null>(null)
    const [controllerId, setControllerId] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [label, setLabel] = useState(() => {
        if (typeof navigator !== 'undefined') {
            return `${navigator.platform || 'Browser'} dashboard`
        }
        return 'Dashboard'
    })
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [trustOpened, setTrustOpened] = useState(false)
    const [canFinish, setCanFinish] = useState(false)

    const handleDiscover = useCallback(async () => {
        setBusy(true)
        setError(null)
        try {
            const candidates = lanDiscoveryCandidates([
                ...issuedUrls,
                ...(manualUrl.trim() ? [manualUrl.trim()] : []),
            ])
            const probe = await discoverController(candidates)
            if (!probe) {
                throw new Error(
                    'No controller found on the LAN. Use Trust controller, continue past the browser warning, and you will come back here.'
                )
            }
            const identity = await identifyController(probe.baseUrl)
            setBaseUrl(probe.baseUrl)
            setControllerName(identity.name)
            setControllerId(identity.controllerId)
            setPhase('pair')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Discovery failed')
        } finally {
            setBusy(false)
        }
    }, [issuedUrls, manualUrl])

    function handleTrustController() {
        const returnTo = `${window.location.origin}/setup`
        const url = buildTlsTrustUrl(manualUrl, returnTo)
        setTrustOpened(true)
        setError(null)
        const popup = window.open(url, 'nemu-tls-trust', 'width=520,height=640')
        if (!popup) {
            window.location.assign(url)
        }
    }

    useEffect(() => {
        const token = getClientToken()
        const rememberedId = getRememberedControllerId()
        const rememberedUrl = getRememberedBaseUrl()
        if (token && rememberedId) {
            setCanFinish(true)
            setControllerId(rememberedId)
            if (rememberedUrl) setBaseUrl(rememberedUrl)
            setPhase('pair')
        }
    }, [])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('trusted') === '1') {
            router.replace('/setup')
            void handleDiscover()
        }

        function onMessage(event: MessageEvent) {
            if (
                typeof event.data !== 'object' ||
                event.data === null ||
                event.data.type !== TLS_TRUSTED_MESSAGE ||
                !isLanControllerOrigin(event.origin)
            ) {
                return
            }
            void handleDiscover()
        }

        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [handleDiscover, router])

    async function handlePair() {
        setBusy(true)
        setError(null)
        setPhase('saving')
        try {
            const rememberedId = getRememberedControllerId()
            let id = rememberedId ?? controllerId

            if (!canFinish) {
                const email = user?.primaryEmailAddress?.emailAddress
                const userId = user?.id
                if (!email || !userId) {
                    throw new Error(
                        'This Google account did not share an email address.'
                    )
                }
                const result = await pairWithController(baseUrl, {
                    code: code.trim(),
                    clientLabel: label.trim(),
                    userId,
                    email,
                    displayName: user.fullName ?? undefined,
                })
                id = result.pair.controllerId || result.identity.controllerId
            }

            if (!id) {
                throw new Error('Missing controller id')
            }

            await withTimeout(
                createPairing({ controllerId: id }),
                CONVEX_PAIR_TIMEOUT_MS,
                'Could not reach Nemu cloud. Check your connection and try Finish pairing again.'
            )
            await reprobe()
            setPhase('done')
            router.replace('/')
            router.refresh()
        } catch (err) {
            setPhase('pair')
            setError(formatPairingError(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <p className="font-semibold text-primary text-sm tracking-wide">
                    Nemu
                </p>
                <h1 className="font-bold text-3xl tracking-tight">
                    Connect your home
                </h1>
                <p className="text-muted-foreground text-sm">
                    Pair this dashboard with your Nemu controller on the local
                    network. You&apos;ll need the 6-digit code from the
                    controller.
                </p>
            </div>

            {phase === 'discover' ? (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label
                            className="font-medium text-sm"
                            htmlFor="manual-url"
                        >
                            Controller address (optional)
                        </label>
                        <Input
                            id="manual-url"
                            onChange={(e) => setManualUrl(e.target.value)}
                            placeholder="https://192.168.1.50:6368"
                            value={manualUrl}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Button
                            className="w-full"
                            disabled={busy}
                            onClick={() => void handleDiscover()}
                        >
                            {busy ? 'Searching…' : 'Find controller'}
                        </Button>
                        {hasIssuedHostname ? null : (
                            <Button
                                className="w-full"
                                disabled={busy}
                                onClick={handleTrustController}
                                type="button"
                                variant="outline"
                            >
                                {trustOpened
                                    ? 'Waiting for browser trust…'
                                    : 'Trust controller'}
                            </Button>
                        )}
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                        {hasIssuedHostname
                            ? 'Your controller has a trusted Nemu hostname. Find controller will try that address first.'
                            : 'The browser warning has to appear on the controller itself. Continue past it and this page will resume automatically.'}
                    </p>
                </div>
            ) : null}

            {phase === 'pair' || phase === 'saving' ? (
                <div className="space-y-4">
                    <div className="rounded-xl border border-border/80 bg-muted/30 p-4 text-sm">
                        <p className="font-medium">
                            {controllerName ?? 'Controller'}
                        </p>
                        <p className="mt-1 font-mono text-muted-foreground text-xs">
                            {controllerId}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                            {baseUrl}
                        </p>
                    </div>
                    {canFinish ? (
                        <p className="text-muted-foreground text-sm">
                            This browser already has a controller token. Finish
                            pairing to create the cloud link and open home.
                        </p>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label
                                    className="font-medium text-sm"
                                    htmlFor="pair-code"
                                >
                                    Pairing code
                                </label>
                                <Input
                                    autoComplete="one-time-code"
                                    id="pair-code"
                                    inputMode="numeric"
                                    maxLength={6}
                                    onChange={(e) =>
                                        setCode(
                                            e.target.value
                                                .replace(/\D/g, '')
                                                .slice(0, 6)
                                        )
                                    }
                                    placeholder="123456"
                                    value={code}
                                />
                            </div>
                            <div className="space-y-2">
                                <label
                                    className="font-medium text-sm"
                                    htmlFor="client-label"
                                >
                                    This device label
                                </label>
                                <Input
                                    id="client-label"
                                    onChange={(e) => setLabel(e.target.value)}
                                    value={label}
                                />
                            </div>
                        </>
                    )}
                    <div className="flex gap-2">
                        <Button
                            disabled={busy}
                            onClick={() => {
                                setCanFinish(false)
                                setPhase('discover')
                                setError(null)
                            }}
                            type="button"
                            variant="outline"
                        >
                            Back
                        </Button>
                        <Button
                            className="flex-1"
                            disabled={
                                busy ||
                                (!canFinish &&
                                    (code.length !== 6 || !label.trim()))
                            }
                            onClick={() => void handlePair()}
                        >
                            {busy
                                ? 'Pairing…'
                                : canFinish
                                  ? 'Finish pairing'
                                  : 'Pair controller'}
                        </Button>
                    </div>
                </div>
            ) : null}

            {error ? (
                <p className="text-destructive text-sm" role="alert">
                    {error}
                </p>
            ) : null}
        </div>
    )
}
