import { useController } from '@nemu/controller'
import type { UpdateStatusResponse } from '@nemu/protocol'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { useHomeSession } from '~/components/home-session'
import { OwnerOnly, useMembershipRole } from '~/components/membership-role'
import { Text } from '~/components/ui/text'

type ReleaseRead =
    | { kind: 'reading' }
    | { kind: 'read'; release: UpdateStatusResponse }
    | { kind: 'failed'; message: string }

const CHANNEL_LABELS: Record<UpdateStatusResponse['channel'], string> = {
    stable: 'Stable',
    canary: 'Canary',
}

/**
 * The installed Release and whether a newer one is available. Every active
 * Membership sees it, over LAN or Relay (NEM-95).
 */
export function ReleaseSettings() {
    const { activeHome } = useHomeSession()
    const { status, getReleaseStatus } = useController()
    const live = status.mode === 'lan' || status.mode === 'relay'
    const [read, setRead] = useState<ReleaseRead>({ kind: 'reading' })
    const home = activeHome?.name ?? 'this Home'

    useEffect(() => {
        if (!live) return
        let current = true
        setRead({ kind: 'reading' })
        getReleaseStatus().then(
            (release) => {
                if (current) setRead({ kind: 'read', release })
            },
            (cause: unknown) => {
                if (!current) return
                setRead({
                    kind: 'failed',
                    message:
                        cause instanceof Error
                            ? cause.message
                            : 'Could not read the installed Release',
                })
            }
        )
        return () => {
            current = false
        }
    }, [live, getReleaseStatus, status.mode])

    return (
        <View className="gap-2">
            <Text className="font-semibold text-foreground text-lg">
                Release
            </Text>
            {!live ? (
                <Text className="text-muted-foreground text-sm">
                    Connect to {home} to see its installed Release.
                </Text>
            ) : read.kind === 'reading' ? (
                <Text className="text-muted-foreground text-sm">
                    Reading the installed Release…
                </Text>
            ) : read.kind === 'failed' ? (
                <Text accessibilityRole="alert" className="text-sm">
                    {read.message}
                </Text>
            ) : (
                <InstalledRelease home={home} release={read.release} />
            )}
        </View>
    )
}

function InstalledRelease({
    home,
    release,
}: {
    home: string
    release: UpdateStatusResponse
}) {
    const role = useMembershipRole()
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
                    <OwnerOnly>
                        <Text className="text-muted-foreground text-sm">
                            Install it from the dashboard.
                        </Text>
                    </OwnerOnly>
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
        </View>
    )
}
