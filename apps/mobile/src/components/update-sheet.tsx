import { useController } from '@nemu/controller'
import type { UpdateStatusResponse } from '@nemu/protocol'
import { useState } from 'react'
import { View } from 'react-native'

import {
    ControllerSheet,
    useControllerSheet,
} from '~/components/controller-sheet'
import { useLastKnownRole } from '~/components/membership-role'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { useReleaseStatus } from '~/components/use-release-status'
import { errorMessage } from '~/lib/connection'

/**
 * Confirms installing the available Release: its version and release notes.
 * Once the Controller has started, the sheet closes and Settings follows the
 * restart. While the Controller is unreachable it stays open, disabled.
 */
export function UpdateSheet({ onClose }: { onClose: () => void }) {
    const { release, error } = useReleaseStatus()
    const role = useLastKnownRole()
    return (
        <ControllerSheet onClose={onClose} title="Install update">
            {role === 'member' ? (
                <Text className="text-muted-foreground text-sm">
                    Only an Owner can install an update.
                </Text>
            ) : error ? (
                <Text accessibilityRole="alert" className="text-sm">
                    {error}
                </Text>
            ) : !release || role !== 'owner' ? (
                <Text className="text-muted-foreground text-sm">
                    Reading the available Release…
                </Text>
            ) : release.newerReleaseAvailable ? (
                <Confirmation onStarted={onClose} release={release} />
            ) : (
                <Text className="text-muted-foreground text-sm">
                    This is the latest Release.
                </Text>
            )}
        </ControllerSheet>
    )
}

function Confirmation({
    release,
    onStarted,
}: {
    release: UpdateStatusResponse
    onStarted: () => void
}) {
    const { reachable } = useControllerSheet()
    const { releaseUpdate, startReleaseUpdate } = useController()
    const [starting, setStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const available = release.availableRelease
    const notes = available?.releaseNotes?.trim()
    const busy =
        starting ||
        release.maintenanceMode ||
        releaseUpdate?.phase === 'updating'

    async function install() {
        if (!reachable || busy) return
        setStarting(true)
        setError(null)
        try {
            await startReleaseUpdate('install', available?.platformVersion)
            onStarted()
        } catch (cause) {
            setError(
                errorMessage(cause, 'The Controller did not start the update')
            )
            setStarting(false)
        }
    }

    return (
        <View className="gap-6">
            <View className="gap-2">
                <View className="flex-row justify-between gap-4">
                    <Text className="text-muted-foreground text-sm">
                        New Release
                    </Text>
                    <Text className="font-mono text-foreground text-sm">
                        {available?.platformVersion ?? 'Latest'}
                    </Text>
                </View>
                <View className="flex-row justify-between gap-4">
                    <Text className="text-muted-foreground text-sm">
                        Installed Release
                    </Text>
                    <Text className="font-mono text-foreground text-sm">
                        {release.platformVersion}
                    </Text>
                </View>
            </View>
            <View className="gap-2">
                <Text
                    accessibilityRole="header"
                    className="font-medium text-foreground"
                >
                    Release notes
                </Text>
                <Text className="text-muted-foreground text-sm leading-relaxed">
                    {notes ||
                        'This Release was published without release notes.'}
                </Text>
            </View>
            <Text className="text-muted-foreground text-sm leading-relaxed">
                The Controller restarts during the update, so Devices can’t be
                controlled from Nemu for a few minutes. If the new Release
                doesn’t stay healthy, the Controller goes back to the installed
                one.
            </Text>
            <Button
                disabled={!reachable || busy}
                onPress={install}
                title={starting ? 'Starting…' : 'Install now'}
            />
            {error ? (
                <Text accessibilityRole="alert" className="text-destructive">
                    {error}
                </Text>
            ) : null}
        </View>
    )
}
