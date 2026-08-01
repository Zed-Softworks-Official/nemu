'use client'

import { api, useMutation, useQuery } from '@nemu/cloud'
import {
    clearClientToken,
    clearRememberedBaseUrl,
    clearRememberedControllerId,
    createControllerHttp,
    getClientToken,
    getRememberedBaseUrl,
    getRememberedControllerId,
    useController,
} from '@nemu/controller'
import {
    type ClientToken,
    type PairingCodeResponse,
    pairingCodeResponseSchema,
    tokensResponseSchema,
} from '@nemu/protocol'
import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import { Input } from '@nemu/ui/components/input'
import { Separator } from '@nemu/ui/components/separator'
import {
    CopyIcon,
    LaptopIcon,
    RadioTowerIcon,
    RotateCwIcon,
    UsersIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '~/components/dashboard/page-header'
import { env } from '~/env'

export default function SettingsPage() {
    const router = useRouter()
    const { status, reprobe } = useController()
    const controllers = useQuery(api.controllers.listMine)
    const removePairing = useMutation(api.pairings.remove)

    const controller = controllers?.[0]
    const controllerId =
        controller?.controllerId ?? getRememberedControllerId() ?? '—'
    const baseUrl = status.baseUrl ?? getRememberedBaseUrl()

    const [tokens, setTokens] = useState<ClientToken[]>([])
    const [tokensError, setTokensError] = useState<string | null>(null)
    const [inviteCode, setInviteCode] = useState<PairingCodeResponse | null>(
        null
    )
    const [inviteError, setInviteError] = useState<string | null>(null)
    const [busyInvite, setBusyInvite] = useState(false)
    const [busyUnpair, setBusyUnpair] = useState(false)
    const [copied, setCopied] = useState(false)

    const loadTokens = useCallback(async () => {
        if (!baseUrl || !getClientToken()) {
            setTokens([])
            return
        }
        try {
            const http = createControllerHttp(baseUrl, getClientToken)
            const { data } = await http.get('/api/tokens')
            setTokens(tokensResponseSchema.parse(data).tokens)
            setTokensError(null)
        } catch (err) {
            setTokensError(
                err instanceof Error ? err.message : 'Failed to load clients'
            )
        }
    }, [baseUrl])

    useEffect(() => {
        void loadTokens()
    }, [loadTokens])

    async function handleInvite() {
        if (!baseUrl) {
            setInviteError(
                'Connect to the controller on your home network first.'
            )
            return
        }
        setBusyInvite(true)
        setInviteError(null)
        try {
            const http = createControllerHttp(baseUrl, getClientToken)
            const { data } = await http.post('/api/pairing-code')
            setInviteCode(pairingCodeResponseSchema.parse(data))
        } catch (err) {
            setInviteError(
                err instanceof Error
                    ? err.message
                    : 'Could not mint pairing code'
            )
        } finally {
            setBusyInvite(false)
        }
    }

    async function handleRevoke(tokenId: string) {
        if (!baseUrl) return
        try {
            const http = createControllerHttp(baseUrl, getClientToken)
            await http.delete(`/api/tokens/${encodeURIComponent(tokenId)}`)
            await loadTokens()
        } catch (err) {
            setTokensError(
                err instanceof Error ? err.message : 'Failed to revoke client'
            )
        }
    }

    async function handleUnpair() {
        setBusyUnpair(true)
        try {
            if (controllerId && controllerId !== '—') {
                await removePairing({ controllerId })
            }
            clearClientToken()
            clearRememberedBaseUrl()
            clearRememberedControllerId()
            router.replace('/setup')
        } catch (err) {
            setTokensError(
                err instanceof Error ? err.message : 'Failed to unpair'
            )
        } finally {
            setBusyUnpair(false)
        }
    }

    const inviteSteps = inviteCode
        ? [
              `1. Create a Nemu account at ${env.NEXT_PUBLIC_DASHBOARD_URL}/sign-in`,
              '2. Join this home Wi‑Fi network',
              `3. Open ${env.NEXT_PUBLIC_DASHBOARD_URL}/setup`,
              `4. Enter pairing code: ${inviteCode.code}`,
          ].join('\n')
        : ''

    async function copyInvite() {
        if (!inviteSteps) return
        await navigator.clipboard.writeText(inviteSteps)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            <PageHeader
                description="Manage your controller, household access, and dashboard preferences."
                title="Settings"
            />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Controller</CardTitle>
                            <CardDescription>
                                The Nemu controller this dashboard connects to.
                            </CardDescription>
                            <CardAction>
                                <Badge variant="soft">{status.label}</Badge>
                            </CardAction>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-2">
                                <label
                                    className="font-medium text-sm"
                                    htmlFor="controller-name"
                                >
                                    Controller name
                                </label>
                                <Input
                                    id="controller-name"
                                    readOnly
                                    value={controller?.name ?? 'Home'}
                                />
                                <p className="text-muted-foreground text-xs">
                                    Shown when pairing a new client.
                                </p>
                            </div>
                            <Separator />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <p className="text-muted-foreground text-xs">
                                        Local address
                                    </p>
                                    <p className="mt-1 font-medium text-sm">
                                        {baseUrl ?? '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">
                                        Controller ID
                                    </p>
                                    <p className="mt-1 break-all font-mono text-sm">
                                        {controllerId}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Invite someone to this home</CardTitle>
                            <CardDescription>
                                Family members create their own Nemu account,
                                join your Wi‑Fi, and enter a short-lived pairing
                                code.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <UsersIcon className="size-4" />
                                </div>
                                <p className="text-muted-foreground text-sm">
                                    Requires a Home (LAN) connection to mint a
                                    code. Codes expire in about 5 minutes and
                                    can only be used once.
                                </p>
                            </div>
                            {inviteCode ? (
                                <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-4">
                                    <p className="font-mono text-3xl tracking-[0.3em]">
                                        {inviteCode.code}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                        Expires{' '}
                                        {new Date(
                                            inviteCode.expiresAt
                                        ).toLocaleString()}
                                    </p>
                                    <pre className="whitespace-pre-wrap text-muted-foreground text-xs">
                                        {inviteSteps}
                                    </pre>
                                    <Button
                                        onClick={() => void copyInvite()}
                                        size="sm"
                                        variant="outline"
                                    >
                                        <CopyIcon data-icon="inline-start" />
                                        {copied
                                            ? 'Copied'
                                            : 'Copy instructions'}
                                    </Button>
                                </div>
                            ) : null}
                            {inviteError ? (
                                <p className="text-destructive text-sm">
                                    {inviteError}
                                </p>
                            ) : null}
                        </CardContent>
                        <CardFooter className="border-t">
                            <Button
                                disabled={busyInvite || status.mode !== 'lan'}
                                onClick={() => void handleInvite()}
                                size="sm"
                            >
                                {busyInvite
                                    ? 'Generating…'
                                    : 'Generate pairing code'}
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Connection</CardTitle>
                            <CardDescription>
                                Nemu prefers your private LAN and falls back to
                                the relay when you are away.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <RadioTowerIcon className="size-4" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">
                                        {status.label}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                        {status.mode === 'lan'
                                            ? 'Device traffic stays on your home network.'
                                            : status.mode === 'relay'
                                              ? 'Commands pass through the ephemeral Convex relay.'
                                              : 'Waiting for a reachable controller.'}
                                    </p>
                                </div>
                            </div>
                            <Separator />
                            <Button
                                onClick={() => void reprobe()}
                                size="sm"
                                variant="outline"
                            >
                                <RotateCwIcon data-icon="inline-start" />
                                Test connection
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Paired clients</CardTitle>
                            <CardDescription>
                                Devices currently trusted by your controller.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {tokens.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    {status.mode === 'lan'
                                        ? 'No paired clients found.'
                                        : 'Connect on the LAN to manage clients.'}
                                </p>
                            ) : (
                                tokens.map((token, index) => (
                                    <div key={token.id}>
                                        {index > 0 ? (
                                            <Separator className="mb-4" />
                                        ) : null}
                                        <ClientRow
                                            detail={
                                                token.lastSeenAt
                                                    ? `Last active ${new Date(token.lastSeenAt).toLocaleString()}`
                                                    : `Paired ${new Date(token.createdAt).toLocaleString()}`
                                            }
                                            name={token.label}
                                            onRevoke={() =>
                                                void handleRevoke(token.id)
                                            }
                                        />
                                    </div>
                                ))
                            )}
                            {tokensError ? (
                                <p className="text-destructive text-sm">
                                    {tokensError}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Unpair controller</CardTitle>
                            <CardDescription>
                                Remove local credentials and your cloud pairing
                                for this account.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                disabled={busyUnpair}
                                onClick={() => void handleUnpair()}
                                size="sm"
                                variant="destructive"
                            >
                                {busyUnpair
                                    ? 'Unpairing…'
                                    : 'Unpair this dashboard'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function ClientRow({
    name,
    detail,
    onRevoke,
}: {
    name: string
    detail: string
    onRevoke: () => void
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <LaptopIcon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{name}</p>
                <p className="truncate text-muted-foreground text-xs">
                    {detail}
                </p>
            </div>
            <Button onClick={onRevoke} size="sm" variant="ghost">
                Revoke
            </Button>
        </div>
    )
}
