import { useController } from '@nemu/controller'
import { ApiError } from '@nemu/protocol'
import { useState } from 'react'
import { View } from 'react-native'

import { useHomeSession } from '~/components/home-session'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

type Pending = 'remove' | 'leave'

/**
 * Access Client revocation and Leaving a Home for the active Home.
 *
 * The phone does not know its Membership role; the Controller decides, and
 * any refusal is shown as the Controller gave it.
 */
export function HomeAccessSettings() {
    const { activeHome, forgetPairing, switchHome } = useHomeSession()
    const { status, revokeCurrentToken, leaveHome } = useController()
    const [confirming, setConfirming] = useState<Pending | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!activeHome) return null
    const home = activeHome.name
    const live = status.mode === 'lan' || status.mode === 'relay'

    if (status.mode === 'offline') {
        return (
            <View className="gap-3">
                <Text accessibilityRole="alert" className="text-sm">
                    This phone can’t reach {home} on the Home network or
                    remotely. Forgetting it only clears {home} from this phone.
                    {` ${home}`} still trusts this phone until an Owner revokes
                    it from the dashboard.
                </Text>
                <View className="flex-row">
                    <Button
                        onPress={forgetPairing}
                        title="Forget on this phone"
                        variant="destructive"
                    />
                </View>
            </View>
        )
    }

    async function run(action: Pending) {
        setBusy(true)
        setError(null)
        try {
            if (action === 'remove') {
                await revokeCurrentToken()
                forgetPairing()
            } else {
                await leaveHome()
                forgetPairing()
                switchHome()
            }
        } catch (cause) {
            setError(describeRefusal(cause, home))
            setBusy(false)
            setConfirming(null)
        }
    }

    if (confirming === 'remove') {
        return (
            <Confirmation
                body={`Only this phone loses access to ${home}. Your other phones and browsers keep working.`}
                busy={busy}
                confirmTitle="Remove this phone"
                onCancel={() => setConfirming(null)}
                onConfirm={() => run('remove')}
            />
        )
    }

    if (confirming === 'leave') {
        return (
            <Confirmation
                body={`Your Membership in ${home} ends. Every phone and browser you use with ${home} loses access, including this one.`}
                busy={busy}
                confirmTitle="Leave"
                onCancel={() => setConfirming(null)}
                onConfirm={() => run('leave')}
            />
        )
    }

    return (
        <View className="gap-3">
            {live ? null : (
                <Text className="text-muted-foreground text-sm">
                    Connecting to {home}…
                </Text>
            )}
            <View className="flex-row">
                <Button
                    disabled={!live}
                    onPress={() => setConfirming('remove')}
                    title={`Remove this phone from ${home}`}
                    variant="outline"
                />
            </View>
            <View className="flex-row">
                <Button
                    disabled={!live}
                    onPress={() => setConfirming('leave')}
                    title={`Leave ${home}`}
                    variant="destructive"
                />
            </View>
            {error ? (
                <Text accessibilityRole="alert" className="text-destructive">
                    {error}
                </Text>
            ) : null}
        </View>
    )
}

function Confirmation({
    body,
    busy,
    confirmTitle,
    onCancel,
    onConfirm,
}: {
    body: string
    busy: boolean
    confirmTitle: string
    onCancel: () => void
    onConfirm: () => void
}) {
    return (
        <View className="gap-3">
            <Text className="text-sm">{body}</Text>
            <View className="flex-row gap-3">
                <Button
                    disabled={busy}
                    onPress={onConfirm}
                    title={confirmTitle}
                    variant="destructive"
                />
                <Button
                    disabled={busy}
                    onPress={onCancel}
                    title="Cancel"
                    variant="ghost"
                />
            </View>
        </View>
    )
}

function describeRefusal(cause: unknown, home: string): string {
    if (cause instanceof ApiError && cause.code === 'last_owner') {
        return `You are the only Owner of ${home}, so you can’t leave it. Manage this Home’s Members from the dashboard instead.`
    }
    if (cause instanceof Error && cause.message) return cause.message
    return 'The Controller did not accept the request.'
}
