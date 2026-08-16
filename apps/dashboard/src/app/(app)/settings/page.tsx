'use client'

import { useUser } from '@clerk/nextjs'
import { api, useConvexAuth, useMutation, useQuery } from '@nemu/cloud'
import {
    clearClientToken,
    clearRememberedBaseUrl,
    clearRememberedControllerId,
    createControllerHttp,
    getClientToken,
    getRememberedBaseUrl,
    getRememberedControllerId,
    identifyController,
    useController,
} from '@nemu/controller'
import {
    ApiError,
    applyUpdateResponseSchema,
    type ClientToken,
    type HouseholdMember,
    type PairingCodeResponse,
    pairingCodeResponseSchema,
    updateStatusResponseSchema,
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
    DownloadIcon,
    LaptopIcon,
    RadioTowerIcon,
    RotateCwIcon,
    UsersIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '~/components/dashboard/page-header'
import { env } from '~/env'

type CoreUpdateState =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'upToDate' }
    | { kind: 'available' }
    | { kind: 'applying' }
    | { kind: 'restarting' }
    | { kind: 'unavailable'; message: string }
    | { kind: 'error'; message: string }

export default function SettingsPage() {
    const router = useRouter()
    const { user } = useUser()
    const {
        status,
        reprobe,
        getMembers,
        inviteMember,
        removeMember,
        getTokens,
        revokeToken,
        revokeCurrentToken,
        bootstrapOwner,
    } = useController()
    const { isAuthenticated } = useConvexAuth()
    const controllers = useQuery(
        api.controllers.listMine,
        isAuthenticated ? {} : 'skip'
    )
    const removePairing = useMutation(api.pairings.remove)
    const removeUserPairing = useMutation(api.pairings.removeUser)
    const invitePairing = useMutation(api.pairings.invite)
    const removeInvite = useMutation(api.invites.remove)

    const controller = controllers?.[0]
    const controllerId =
        controller?.controllerId ?? getRememberedControllerId() ?? '—'
    const baseUrl = status.baseUrl ?? getRememberedBaseUrl()
    const connected = status.mode === 'lan' || status.mode === 'relay'

    const [members, setMembers] = useState<HouseholdMember[]>([])
    const [tokens, setTokens] = useState<ClientToken[]>([])
    const [householdError, setHouseholdError] = useState<string | null>(null)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteHint, setInviteHint] = useState<string | null>(null)
    const [inviteError, setInviteError] = useState<string | null>(null)
    const [busyInvite, setBusyInvite] = useState(false)
    const [busyUnpair, setBusyUnpair] = useState(false)
    const [copied, setCopied] = useState(false)
    const [coreVersion, setCoreVersion] = useState<string | null>(null)
    const [inviteCode, setInviteCode] = useState<PairingCodeResponse | null>(
        null
    )
    const [busyCode, setBusyCode] = useState(false)
    const [codeError, setCodeError] = useState<string | null>(null)
    const [updateState, setUpdateState] = useState<CoreUpdateState>({
        kind: 'idle',
    })
    const updateStateRef = useRef(updateState)
    updateStateRef.current = updateState

    const myEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase()
    const me = members.find(
        (member) =>
            member.userId === user?.id || member.email.toLowerCase() === myEmail
    )
    const isOwner = me?.role === 'owner'
    const canManageUpdates = Boolean(
        isOwner && status.mode === 'lan' && baseUrl
    )
    const showUpdates =
        canManageUpdates ||
        updateState.kind === 'applying' ||
        updateState.kind === 'restarting'

    const loadIdentity = useCallback(async () => {
        if (!baseUrl || status.mode !== 'lan') {
            setCoreVersion(null)
            return
        }
        try {
            const identity = await identifyController(baseUrl)
            setCoreVersion(identity.version ?? null)
        } catch {
            setCoreVersion(null)
        }
    }, [baseUrl, status.mode])

    const loadHousehold = useCallback(async () => {
        if (!connected) {
            setMembers([])
            setTokens([])
            return
        }
        try {
            const [nextMembers, nextTokens] = await Promise.all([
                getMembers(),
                getTokens(),
            ])
            setMembers(nextMembers)
            setTokens(nextTokens)
            setHouseholdError(null)

            if (
                nextMembers.length === 0 &&
                user?.id &&
                user.primaryEmailAddress?.emailAddress
            ) {
                await bootstrapOwner({
                    userId: user.id,
                    email: user.primaryEmailAddress.emailAddress,
                    displayName: user.fullName ?? undefined,
                })
                const bootstrapped = await getMembers()
                setMembers(bootstrapped)
            }
        } catch (err) {
            setHouseholdError(
                err instanceof Error ? err.message : 'Failed to load household'
            )
        }
    }, [
        bootstrapOwner,
        connected,
        getMembers,
        getTokens,
        user?.fullName,
        user?.id,
        user?.primaryEmailAddress?.emailAddress,
    ])

    useEffect(() => {
        void loadHousehold()
    }, [loadHousehold])

    useEffect(() => {
        void loadIdentity()
    }, [loadIdentity])

    const checkUpdates = useCallback(async () => {
        if (!baseUrl || status.mode !== 'lan') return
        if (
            updateStateRef.current.kind === 'applying' ||
            updateStateRef.current.kind === 'restarting'
        ) {
            return
        }
        setUpdateState({ kind: 'checking' })
        try {
            const http = createControllerHttp(baseUrl, getClientToken, 30_000)
            const { data } = await http.get('/api/updates')
            const parsed = updateStatusResponseSchema.parse(data)
            setCoreVersion(parsed.currentVersion)
            setUpdateState(
                parsed.updateAvailable
                    ? { kind: 'available' }
                    : { kind: 'upToDate' }
            )
        } catch (err) {
            if (
                err instanceof ApiError &&
                err.code === 'watchtower_unavailable'
            ) {
                setUpdateState({
                    kind: 'unavailable',
                    message: err.message,
                })
                return
            }
            setUpdateState({
                kind: 'error',
                message:
                    err instanceof Error
                        ? err.message
                        : 'Failed to check for updates',
            })
        }
    }, [baseUrl, status.mode])

    useEffect(() => {
        if (!canManageUpdates) return
        void checkUpdates()
    }, [canManageUpdates, checkUpdates])

    async function handleApplyUpdate() {
        if (!baseUrl) return
        if (
            !window.confirm('The controller will restart for about a minute.')
        ) {
            return
        }
        setUpdateState({ kind: 'applying' })
        try {
            const http = createControllerHttp(baseUrl, getClientToken, 15_000)
            const { data } = await http.post('/api/updates/apply')
            const parsed = applyUpdateResponseSchema.parse(data)
            if (parsed.started) {
                setUpdateState({ kind: 'restarting' })
            }
        } catch (err) {
            setUpdateState({
                kind: 'error',
                message:
                    err instanceof Error
                        ? err.message
                        : 'Failed to start update',
            })
        }
    }

    const inviteSteps = useMemo(() => {
        if (!inviteEmail.trim()) return ''
        const email = inviteEmail.trim().toLowerCase()
        return [
            `Sign in with Google at ${env.NEXT_PUBLIC_DASHBOARD_URL}/sign-in`,
            `Use this Google account: ${email}`,
        ].join('\n')
    }, [inviteEmail])

    async function handleInvite() {
        const email = inviteEmail.trim().toLowerCase()
        if (!email.includes('@')) {
            setInviteError('Enter the Google account email to invite.')
            return
        }
        if (controllerId === '—') {
            setInviteError('Controller is not linked yet.')
            return
        }
        setBusyInvite(true)
        setInviteError(null)
        try {
            await inviteMember(email)
            await invitePairing({ controllerId, email })
            setInviteHint(email)
            await loadHousehold()
        } catch (err) {
            setInviteError(
                err instanceof Error ? err.message : 'Could not send invite'
            )
        } finally {
            setBusyInvite(false)
        }
    }

    async function copyInvite() {
        if (!inviteSteps) return
        await navigator.clipboard.writeText(inviteSteps)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    async function handleRemoveMember(member: HouseholdMember) {
        if (controllerId === '—') return
        try {
            await removeMember(member.id)
            if (member.userId) {
                await removeUserPairing({
                    controllerId,
                    userId: member.userId,
                })
            }
            await removeInvite({ controllerId, email: member.email })
            await loadHousehold()
        } catch (err) {
            setHouseholdError(
                err instanceof Error ? err.message : 'Failed to remove person'
            )
        }
    }

    async function handleRevoke(tokenId: string) {
        try {
            await revokeToken(tokenId)
            await loadHousehold()
        } catch (err) {
            setHouseholdError(
                err instanceof Error ? err.message : 'Failed to revoke device'
            )
        }
    }

    async function handleMintPairingCode() {
        if (!baseUrl) {
            setCodeError('Connect on your home network to mint a pairing code.')
            return
        }
        setBusyCode(true)
        setCodeError(null)
        try {
            const http = createControllerHttp(baseUrl, getClientToken)
            const { data } = await http.post('/api/pairing-code')
            setInviteCode(pairingCodeResponseSchema.parse(data))
        } catch (err) {
            setCodeError(
                err instanceof Error
                    ? err.message
                    : 'Could not mint pairing code'
            )
        } finally {
            setBusyCode(false)
        }
    }

    async function handleUnpair() {
        setBusyUnpair(true)
        try {
            if (connected) {
                try {
                    await revokeCurrentToken()
                } catch {
                    // Local credentials still need to be cleared.
                }
            }
            if (controllerId && controllerId !== '—') {
                await removePairing({ controllerId })
            }
            clearClientToken()
            clearRememberedBaseUrl()
            clearRememberedControllerId()
            router.replace('/setup')
        } catch (err) {
            setHouseholdError(
                err instanceof Error ? err.message : 'Failed to unpair'
            )
        } finally {
            setBusyUnpair(false)
        }
    }

    async function handleLeave() {
        if (!me) {
            await handleUnpair()
            return
        }
        setBusyUnpair(true)
        try {
            await handleRemoveMember(me)
            if (controllerId && controllerId !== '—') {
                await removePairing({ controllerId })
            }
            clearClientToken()
            clearRememberedBaseUrl()
            clearRememberedControllerId()
            router.replace('/setup')
        } finally {
            setBusyUnpair(false)
        }
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
                                    Shown when pairing a new dashboard.
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
                                <div>
                                    <p className="text-muted-foreground text-xs">
                                        Core version
                                    </p>
                                    <p className="mt-1 font-mono text-sm">
                                        {coreVersion ?? '—'}
                                    </p>
                                </div>
                            </div>
                            {showUpdates ? (
                                <>
                                    <Separator />
                                    <CoreUpdatesBlock
                                        canRefresh={
                                            canManageUpdates &&
                                            updateState.kind !== 'checking' &&
                                            updateState.kind !== 'applying' &&
                                            updateState.kind !== 'restarting'
                                        }
                                        onApply={() => void handleApplyUpdate()}
                                        onRefresh={() => void checkUpdates()}
                                        state={updateState}
                                    />
                                </>
                            ) : null}
                        </CardContent>
                    </Card>

                    {isOwner ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    Invite someone to this home
                                </CardTitle>
                                <CardDescription>
                                    They sign in with Google using this email.
                                    No pairing code, and they can use any of
                                    their devices.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <UsersIcon className="size-4" />
                                    </div>
                                    <p className="text-muted-foreground text-sm">
                                        Works from home or away. Invite the
                                        Google account they will actually use.
                                    </p>
                                </div>
                                <div className="grid gap-2">
                                    <label
                                        className="font-medium text-sm"
                                        htmlFor="invite-email"
                                    >
                                        Google account email
                                    </label>
                                    <Input
                                        id="invite-email"
                                        onChange={(e) =>
                                            setInviteEmail(e.target.value)
                                        }
                                        placeholder="family@gmail.com"
                                        type="email"
                                        value={inviteEmail}
                                    />
                                </div>
                                {inviteHint ? (
                                    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-4">
                                        <p className="font-medium text-sm">
                                            Invited {inviteHint}
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
                                    disabled={
                                        busyInvite ||
                                        !connected ||
                                        !inviteEmail.trim()
                                    }
                                    onClick={() => void handleInvite()}
                                    size="sm"
                                >
                                    {busyInvite ? 'Inviting…' : 'Send invite'}
                                </Button>
                            </CardFooter>
                        </Card>
                    ) : null}

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
                            <CardTitle>People</CardTitle>
                            <CardDescription>
                                Accounts that can sign in to this home.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {members.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    {connected
                                        ? 'No household members yet.'
                                        : 'Connect to the controller to manage people.'}
                                </p>
                            ) : (
                                members.map((member, index) => (
                                    <div key={member.id}>
                                        {index > 0 ? (
                                            <Separator className="mb-4" />
                                        ) : null}
                                        <PersonRow
                                            canRemove={
                                                isOwner || member.id === me?.id
                                            }
                                            member={member}
                                            onRemove={() =>
                                                void handleRemoveMember(member)
                                            }
                                        />
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Devices</CardTitle>
                            <CardDescription>
                                Browser sessions trusted by your controller.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {tokens.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    {connected
                                        ? 'No paired devices found.'
                                        : 'Connect to the controller to manage devices.'}
                                </p>
                            ) : (
                                tokens.map((token, index) => (
                                    <div key={token.id}>
                                        {index > 0 ? (
                                            <Separator className="mb-4" />
                                        ) : null}
                                        <ClientRow
                                            detail={deviceDetail(
                                                token,
                                                members
                                            )}
                                            name={token.label}
                                            onRevoke={() =>
                                                void handleRevoke(token.id)
                                            }
                                        />
                                    </div>
                                ))
                            )}
                            {householdError ? (
                                <p className="text-destructive text-sm">
                                    {householdError}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>

                    {isOwner ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Add a device with a code</CardTitle>
                                <CardDescription>
                                    Offline LAN fallback for a device that
                                    already belongs to someone in this home.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {inviteCode ? (
                                    <p className="font-mono text-3xl tracking-[0.3em]">
                                        {inviteCode.code}
                                    </p>
                                ) : (
                                    <p className="text-muted-foreground text-sm">
                                        Requires a Home connection. Codes expire
                                        in about 5 minutes.
                                    </p>
                                )}
                                {codeError ? (
                                    <p className="text-destructive text-sm">
                                        {codeError}
                                    </p>
                                ) : null}
                            </CardContent>
                            <CardFooter className="border-t">
                                <Button
                                    disabled={busyCode || status.mode !== 'lan'}
                                    onClick={() => void handleMintPairingCode()}
                                    size="sm"
                                    variant="outline"
                                >
                                    {busyCode
                                        ? 'Generating…'
                                        : 'Generate pairing code'}
                                </Button>
                            </CardFooter>
                        </Card>
                    ) : null}

                    <Card>
                        <CardHeader>
                            <CardTitle>This dashboard</CardTitle>
                            <CardDescription>
                                Unpair only this browser, or leave the
                                household.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            <Button
                                disabled={busyUnpair}
                                onClick={() => void handleUnpair()}
                                size="sm"
                                variant="outline"
                            >
                                {busyUnpair
                                    ? 'Working…'
                                    : 'Unpair this dashboard'}
                            </Button>
                            <Button
                                disabled={busyUnpair}
                                onClick={() => void handleLeave()}
                                size="sm"
                                variant="destructive"
                            >
                                Leave this home
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function updateStatusCopy(state: CoreUpdateState): string {
    switch (state.kind) {
        case 'idle':
        case 'checking':
            return 'Checking for a newer core image…'
        case 'upToDate':
            return 'Core is up to date.'
        case 'available':
            return 'A new image is available.'
        case 'applying':
            return 'Starting update…'
        case 'restarting':
            return 'Updating… the controller will reconnect shortly.'
        case 'unavailable':
        case 'error':
            return state.message
    }
}

function CoreUpdatesBlock({
    state,
    canRefresh,
    onRefresh,
    onApply,
}: {
    state: CoreUpdateState
    canRefresh: boolean
    onRefresh: () => void
    onApply: () => void
}) {
    const destructive = state.kind === 'unavailable' || state.kind === 'error'
    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-medium text-sm">Updates</p>
                    <p
                        className={
                            destructive
                                ? 'text-destructive text-xs'
                                : 'text-muted-foreground text-xs'
                        }
                    >
                        {updateStatusCopy(state)}
                    </p>
                </div>
                {canRefresh ? (
                    <Button onClick={onRefresh} size="sm" variant="outline">
                        <RotateCwIcon data-icon="inline-start" />
                        Check
                    </Button>
                ) : null}
            </div>
            {state.kind === 'available' ? (
                <Button onClick={onApply} size="sm">
                    <DownloadIcon data-icon="inline-start" />
                    Update now
                </Button>
            ) : null}
            {state.kind === 'applying' ? (
                <Button disabled size="sm">
                    Starting update…
                </Button>
            ) : null}
        </div>
    )
}

function deviceDetail(token: ClientToken, members: HouseholdMember[]): string {
    const owner = token.userId
        ? members.find((member) => member.userId === token.userId)
        : undefined
    const who = owner?.displayName || owner?.email || 'Unknown device'
    const seen = token.lastSeenAt
        ? `Last active ${new Date(token.lastSeenAt).toLocaleString()}`
        : `Paired ${new Date(token.createdAt).toLocaleString()}`
    return `${who} · ${seen}`
}

function PersonRow({
    member,
    canRemove,
    onRemove,
}: {
    member: HouseholdMember
    canRemove: boolean
    onRemove: () => void
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <UsersIcon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                    {member.displayName || member.email}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                    {member.email} · {member.role}
                    {member.status === 'pending' ? ' · pending' : ''}
                </p>
            </div>
            {canRemove ? (
                <Button onClick={onRemove} size="sm" variant="ghost">
                    Remove
                </Button>
            ) : null}
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
