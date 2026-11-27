'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import { api, useMutation, useQuery } from '@nemu/cloud'
import {
    buildTlsTrustUrl,
    clearClientToken,
    discoverController,
    getRememberedBaseUrl,
    getRememberedControllerId,
    INVALID_GRANT_ERROR_CODE,
    identifyController,
    isLanControllerOrigin,
    lanDiscoveryCandidates,
    lanUrlsFromHostnames,
    type PairAgainReason,
    pairWithController,
    setRememberedBaseUrl,
    setRememberedControllerId,
    TLS_TRUSTED_MESSAGE,
    useController,
    WRONG_HOME_ERROR_CODE,
} from '@nemu/controller'
import { ApiError } from '@nemu/protocol'
import { Button } from '@nemu/ui/components/button'
import { Input } from '@nemu/ui/components/input'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { dashboardKeyStore } from '~/lib/access-client-keys'

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
    if (err instanceof ApiError) {
        if (err.code === 'invalid_code') {
            return 'This pairing code was not accepted: it may be wrong, expired or already used, or another device answered for the controller. Get a new 6-digit code from the controller — restart it if no clients are paired yet, or mint one from Settings — and try again.'
        }
        if (err.code === 'tombstoned_access_client') {
            return 'The controller refused this browser’s keys because they were revoked. Reload the page and pair again with a new code.'
        }
        if (err.code === WRONG_HOME_ERROR_CODE) {
            return 'The controller on this network belongs to a different Home.'
        }
        if (err.code === INVALID_GRANT_ERROR_CODE) {
            return 'The controller answered with an Access grant that does not match this pairing. Try again.'
        }
    }
    if (err instanceof Error) return err.message
    return 'Pairing failed'
}

/** Why this browser was sent back to pair, from `?pairAgain=`. */
function pairAgainMessage(reason: string | null): string | null {
    if (!reason) return null
    const known: Partial<Record<PairAgainReason, string>> = {
        not_paired:
            'This browser’s keys for your Home are gone. Pair it again at home.',
        unknown_access_client:
            'This browser no longer has access to your Home. It may have been removed. Pair it again at home.',
        tombstoned_access_client:
            'This browser was removed from your Home. Pair it again at home.',
        bad_signature:
            'Your Home did not accept this browser’s keys. Pair it again at home.',
    }
    return (
        known[reason as PairAgainReason] ?? 'Pair this browser again at home.'
    )
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
    const [pairAgain, setPairAgain] = useState<string | null>(null)

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
        const params = new URLSearchParams(window.location.search)
        setPairAgain(pairAgainMessage(params.get('pairAgain')))
        // Only keys count: a bearer token from before them is unpaired.
        const rememberedId = getRememberedControllerId()
        const rememberedUrl = getRememberedBaseUrl()
        if (!rememberedId) return
        let live = true
        void dashboardKeyStore
            .load(rememberedId)
            .then((record) => {
                if (!live || !record) return
                setCanFinish(true)
                setControllerId(rememberedId)
                if (rememberedUrl) setBaseUrl(rememberedUrl)
                setPhase('pair')
            })
            .catch(() => {})
        return () => {
            live = false
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
                // CPace on the Pairing code (ADR-0037), safe over plain HTTP
                // or a self-signed certificate. The Controller decides
                // whether this makes the first Owner, accepts an Invitation
                // or adds a browser to an existing Membership.
                const result = await pairWithController(baseUrl, {
                    code: code.trim(),
                    clientLabel: label.trim(),
                    userId,
                    email,
                    displayName: user.fullName ?? undefined,
                    expectedControllerId: controllerId ?? undefined,
                    keyStore: dashboardKeyStore,
                })
                id = result.enrollment.controllerId
                setRememberedControllerId(id)
                setRememberedBaseUrl(result.baseUrl)
                // A bearer token from before Access Client keys is dead.
                clearClientToken()
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
                    controller. Accepting an invitation works the same way.
                </p>
            </div>

            {pairAgain ? (
                <output className="block rounded-xl border border-border/80 bg-muted/30 p-4 text-sm">
                    {pairAgain}
                </output>
            ) : null}

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
                            This browser is already paired with this controller.
                            Finish pairing to create the cloud link and open
                            home.
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
