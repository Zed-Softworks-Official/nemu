import { type ReleaseUpdate, useController } from '@nemu/controller'
import type { UpdateStatusResponse } from '@nemu/protocol'
import { useRouter, useSegments } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'

import { useHomeSession } from '~/components/home-session'
import { useLastKnownRole } from '~/components/membership-role'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { useReleaseStatus } from '~/components/use-release-status'
import { errorMessage, isConnected } from '~/lib/connection'
import { updateSheetHref } from '~/lib/tab-routes'

const CHANNEL_LABELS: Record<UpdateStatusResponse['channel'], string> = {
    stable: 'Stable',
    canary: 'Canary',
}

/**
 * The installed Release and whether a newer one is available, for every
 * active Membership (NEM-95). Owners can install an update and roll back
 * (NEM-96). All of it works the same over LAN and Relay.
 */
export function ReleaseSettings() {
    const { activeHome } = useHomeSession()
    const { status, releaseUpdate } = useController()
    const { release, error } = useReleaseStatus()
    const live = isConnected(status)
    const home = activeHome?.name ?? 'this Home'

    return (
        <View className="gap-2">
            <Text className="font-semibold text-foreground text-lg">
                Release
            </Text>
            {releaseUpdate?.phase === 'updating' ? (
                <Updating home={home} update={releaseUpdate} />
            ) : (
                <>
                    {releaseUpdate ? (
                        <UpdateResult update={releaseUpdate} />
                    ) : null}
                    {live ? null : (
                        <Text className="text-muted-foreground text-sm">
                            Connect to {home} to see its installed Release.
                        </Text>
                    )}
                    {live && error ? (
                        <Text accessibilityRole="alert" className="text-sm">
                            {error}
                        </Text>
                    ) : release ? (
                        <InstalledRelease
                            home={home}
                            live={live}
                            release={release}
                        />
                    ) : live ? (
                        <Text className="text-muted-foreground text-sm">
                            Reading the installed Release…
                        </Text>
                    ) : null}
                </>
            )}
        </View>
    )
}

function InstalledRelease({
    home,
    live,
    release,
}: {
    home: string
    live: boolean
    release: UpdateStatusResponse
}) {
    const role = useLastKnownRole()
    return (
        <View className="gap-2">
            <View className="flex-row justify-between gap-4">
                <Text className="text-muted-foreground text-sm">
                    Installed Release
                </Text>
                <Text className="font-mono text-foreground text-sm">
                    {release.platformVersion}
                </Text>
            </View>
            <View className="flex-row justify-between gap-4">
                <Text className="text-muted-foreground text-sm">Channel</Text>
                <Text className="text-foreground text-sm">
                    {CHANNEL_LABELS[release.channel]}
                </Text>
            </View>
            {release.newerReleaseAvailable ? (
                <View className="gap-1">
                    <Text className="text-foreground text-sm">
                        A newer Release is available.
                    </Text>
                    {role === 'member' ? (
                        <Text className="text-muted-foreground text-sm">
                            An Owner of {home} can install it.
                        </Text>
                    ) : null}
                </View>
            ) : (
                <Text className="text-muted-foreground text-sm">
                    This is the latest Release.
                </Text>
            )}
            {role === 'owner' ? (
                <OwnerReleaseActions live={live} release={release} />
            ) : null}
        </View>
    )
}

/** Hidden for Members; the Controller refuses them either way. */
function OwnerReleaseActions({
    live,
    release,
}: {
    live: boolean
    release: UpdateStatusResponse
}) {
    const router = useRouter()
    const segments = useSegments()
    const { startReleaseUpdate } = useController()
    const [confirming, setConfirming] = useState(false)
    const [starting, setStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { maintenanceMode, rollbackStuck } = release
    const canRollBack = release.rollbackSnapshotAvailable || rollbackStuck
    // A stuck rollback holds maintenance; retrying it is the way out.
    const rollbackOff = !live || starting || (maintenanceMode && !rollbackStuck)

    async function rollBack() {
        if (rollbackOff) return
        setStarting(true)
        setError(null)
        try {
            await startReleaseUpdate('rollback')
        } catch (cause) {
            setError(
                errorMessage(cause, 'The Controller did not start the rollback')
            )
            setConfirming(false)
        } finally {
            setStarting(false)
        }
    }

    return (
        <View className="gap-3">
            {maintenanceMode ? (
                <Text accessibilityRole="alert" className="text-sm">
                    {rollbackStuck
                        ? 'A rollback could not finish. The Controller keeps retrying, or you can retry it now.'
                        : 'The Controller is in maintenance while a Release is installed or rolled back.'}
                </Text>
            ) : null}
            {release.newerReleaseAvailable ? (
                <View className="flex-row">
                    <Button
                        disabled={!live || starting || maintenanceMode}
                        onPress={() => router.push(updateSheetHref(segments))}
                        title="Install update"
                    />
                </View>
            ) : null}
            {canRollBack && confirming ? (
                <View className="gap-3">
                    <Text className="text-sm">
                        The Controller restarts and goes back to the previous
                        Release with the Home data saved before the last update.
                        Changes made since then are lost.
                    </Text>
                    <View className="flex-row gap-3">
                        <Button
                            disabled={rollbackOff}
                            onPress={rollBack}
                            title="Roll back now"
                            variant="destructive"
                        />
                        <Button
                            disabled={starting}
                            onPress={() => setConfirming(false)}
                            title="Cancel"
                            variant="ghost"
                        />
                    </View>
                </View>
            ) : canRollBack ? (
                <View className="flex-row">
                    <Button
                        disabled={rollbackOff}
                        onPress={() => setConfirming(true)}
                        title="Roll back"
                        variant="outline"
                    />
                </View>
            ) : null}
            {error ? (
                <Text accessibilityRole="alert" className="text-destructive">
                    {error}
                </Text>
            ) : null}
        </View>
    )
}

function Updating({
    home,
    update,
}: {
    home: string
    update: Extract<ReleaseUpdate, { phase: 'updating' }>
}) {
    return (
        <View accessibilityLiveRegion="polite" className="gap-1">
            <Text className="text-foreground text-sm">
                {update.kind === 'install' ? 'Updating…' : 'Rolling back…'}
            </Text>
            <Text className="text-muted-foreground text-sm">
                {update.reconnecting
                    ? `The Controller is restarting. Reconnecting to ${home}…`
                    : 'The Controller restarts during this. Nemu reconnects on its own.'}
            </Text>
        </View>
    )
}

function UpdateResult({
    update,
}: {
    update: Extract<ReleaseUpdate, { phase: 'finished' }>
}) {
    const { dismissReleaseUpdate } = useController()
    return (
        <View className="gap-2">
            <Text accessibilityRole="alert" className="text-foreground text-sm">
                {describeResult(update)}
            </Text>
            <View className="flex-row">
                <Button
                    onPress={dismissReleaseUpdate}
                    title="Dismiss"
                    variant="ghost"
                />
            </View>
        </View>
    )
}

function describeResult({
    kind,
    outcome,
    release,
}: Extract<ReleaseUpdate, { phase: 'finished' }>): string {
    const version = release?.platformVersion
    switch (outcome) {
        case 'installed':
            return `Release ${version} was installed.`
        case 'rolledBack':
            return kind === 'install'
                ? `The new Release did not stay healthy, so the Controller rolled back to Release ${version}.`
                : `Rolled back to Release ${version}.`
        case 'rollbackStuck':
            return 'The rollback could not finish. The Controller is in maintenance.'
        case 'notCompleted':
            return `The update did not complete. The Controller still runs Release ${version}.`
        case 'notApplied':
            return kind === 'install'
                ? `The update was not installed. The Controller still runs Release ${version}.`
                : `Nothing was rolled back. The Controller still runs Release ${version}.`
        case 'unknown':
            return 'The Controller did not report how it ended. Check the installed Release.'
    }
}
