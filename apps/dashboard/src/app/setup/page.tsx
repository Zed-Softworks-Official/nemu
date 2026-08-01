'use client'

import { api, useMutation } from '@nemu/cloud'
import {
    DEFAULT_LAN_CANDIDATES,
    discoverController,
    identifyController,
    pairWithController,
    useController,
} from '@nemu/controller'
import { Button } from '@nemu/ui/components/button'
import { Input } from '@nemu/ui/components/input'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Phase = 'discover' | 'pair' | 'saving' | 'done'

export default function SetupPage() {
    const router = useRouter()
    const { reprobe } = useController()
    const createPairing = useMutation(api.pairings.create)

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

    async function handleDiscover() {
        setBusy(true)
        setError(null)
        try {
            const candidates = manualUrl.trim()
                ? [manualUrl.trim(), ...DEFAULT_LAN_CANDIDATES]
                : [...DEFAULT_LAN_CANDIDATES]
            const probe = await discoverController(candidates)
            if (!probe) {
                throw new Error(
                    'No controller found on the LAN. Check that nemu-core is running and try a manual address.'
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
    }

    async function handlePair() {
        setBusy(true)
        setError(null)
        setPhase('saving')
        try {
            const result = await pairWithController(
                baseUrl,
                code.trim(),
                label.trim()
            )
            await createPairing({
                controllerId:
                    result.pair.controllerId || result.identity.controllerId,
            })
            await reprobe()
            setPhase('done')
            router.replace('/')
            router.refresh()
        } catch (err) {
            setPhase('pair')
            setError(err instanceof Error ? err.message : 'Pairing failed')
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
                            placeholder="http://192.168.1.50:6368"
                            value={manualUrl}
                        />
                    </div>
                    <Button
                        className="w-full"
                        disabled={busy}
                        onClick={() => void handleDiscover()}
                    >
                        {busy ? 'Searching…' : 'Find controller'}
                    </Button>
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
                    <div className="flex gap-2">
                        <Button
                            disabled={busy}
                            onClick={() => {
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
                                busy || code.length !== 6 || !label.trim()
                            }
                            onClick={() => void handlePair()}
                        >
                            {busy ? 'Pairing…' : 'Pair controller'}
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
