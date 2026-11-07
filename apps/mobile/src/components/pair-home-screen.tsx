import type { AccessClientPairingState } from '@nemu/controller'
import { styled } from 'nativewind'
import { useState } from 'react'
import { ActivityIndicator, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
    useAccessClientPairing,
    useHomeSession,
} from '~/components/home-session'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'

const StyledSafeAreaView = styled(SafeAreaView)

const CODE_LENGTH = 6

/** Guides an unpaired installation through Access Client pairing. */
export function PairHomeScreen() {
    const { switchHome, completePairing } = useHomeSession()
    const { home, state, pairing } = useAccessClientPairing()
    const [code, setCode] = useState('')

    if (!home || !pairing) return null
    const homeName = home.name

    const start = () => {
        setCode('')
        void pairing.start()
    }

    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 justify-between gap-6 p-8">
                <View className="gap-6">
                    <View className="gap-1.5">
                        <Text className="font-medium text-primary text-sm uppercase tracking-[0.18em]">
                            {homeName}
                        </Text>
                        <Text
                            accessibilityRole="header"
                            className="font-semibold text-3xl text-foreground"
                        >
                            {title(state, homeName)}
                        </Text>
                    </View>
                    <PairingBody
                        code={code}
                        homeName={homeName}
                        onCodeChange={(next) =>
                            setCode(
                                next.replace(/\D/g, '').slice(0, CODE_LENGTH)
                            )
                        }
                        state={state}
                    />
                </View>

                <View className="gap-3">
                    {state.phase === 'idle' ? (
                        <Button
                            onPress={start}
                            size="lg"
                            title="Pair this phone"
                        />
                    ) : null}
                    {state.phase === 'awaitingCode' ? (
                        <>
                            <Button
                                disabled={code.length !== CODE_LENGTH}
                                onPress={() => void pairing.submitCode(code)}
                                size="lg"
                                title="Pair"
                            />
                            {state.canUseRelay ? (
                                <Button
                                    onPress={() => void pairing.pairOverRelay()}
                                    size="lg"
                                    title="Pair over the internet instead"
                                    variant="outline"
                                />
                            ) : null}
                        </>
                    ) : null}
                    {state.phase === 'discovering' ||
                    state.phase === 'awaitingCode' ||
                    state.phase === 'pairing' ? (
                        <Button
                            onPress={() => pairing.cancel()}
                            size="lg"
                            title="Cancel"
                            variant="ghost"
                        />
                    ) : null}
                    {state.phase === 'paired' ? (
                        <Button
                            onPress={completePairing}
                            size="lg"
                            title="Continue"
                        />
                    ) : null}
                    {state.phase === 'failed' || state.phase === 'cancelled' ? (
                        <Button
                            onPress={start}
                            size="lg"
                            title={
                                state.phase === 'failed'
                                    ? 'Try again'
                                    : 'Start again'
                            }
                        />
                    ) : null}
                    {state.phase !== 'paired' &&
                    state.phase !== 'pairing' &&
                    state.phase !== 'discovering' ? (
                        <Button
                            onPress={switchHome}
                            size="lg"
                            title="Choose a different Home"
                            variant="ghost"
                        />
                    ) : null}
                </View>
            </StyledSafeAreaView>
        </View>
    )
}

function title(state: AccessClientPairingState, homeName: string): string {
    switch (state.phase) {
        case 'idle':
            return 'Pair this phone'
        case 'discovering':
            return `Looking for ${homeName}`
        case 'awaitingCode':
            return 'Enter pairing code'
        case 'pairing':
            return 'Pairing…'
        case 'paired':
            return 'Paired'
        case 'cancelled':
            return 'Pairing cancelled'
        case 'failed':
            return 'Pairing failed'
    }
}

function PairingBody({
    state,
    homeName,
    code,
    onCodeChange,
}: {
    state: AccessClientPairingState
    homeName: string
    code: string
    onCodeChange: (code: string) => void
}) {
    switch (state.phase) {
        case 'idle':
            return (
                <Message>
                    This phone needs its own access to {homeName}. On the Home
                    network you will enter a 6-digit code from the Controller.
                    Away from home, a Member can pair over the internet.
                </Message>
            )
        case 'discovering':
            return <Busy label={`Looking for ${homeName} on this network…`} />
        case 'pairing':
            return (
                <Busy
                    label={
                        state.method === 'relay'
                            ? `Asking ${homeName} to approve this phone over the internet…`
                            : `Pairing with ${homeName}…`
                    }
                />
            )
        case 'awaitingCode':
            return (
                <View className="gap-3">
                    <Message>
                        Found {state.controllerName} on this network. Enter the
                        6-digit pairing code shown by the Controller.
                    </Message>
                    <TextInput
                        accessibilityLabel="Pairing code"
                        autoComplete="one-time-code"
                        autoFocus
                        className="h-14 rounded-sm border border-border px-4 text-center font-sans-semibold text-2xl text-foreground tracking-[0.4em]"
                        inputMode="numeric"
                        keyboardType="number-pad"
                        maxLength={CODE_LENGTH}
                        onChangeText={onCodeChange}
                        placeholder="000000"
                        placeholderTextColor={colors.mutedForeground}
                        textContentType="oneTimeCode"
                        value={code}
                    />
                </View>
            )
        case 'paired':
            return (
                <Message>
                    This phone can now control {homeName}
                    {state.method === 'relay'
                        ? '. It will use the Home network whenever it is available.'
                        : '.'}
                </Message>
            )
        case 'cancelled':
            return (
                <Message>
                    Nothing was saved on this phone. You can start again when
                    you are ready.
                </Message>
            )
        case 'failed':
            return <Message role="alert">{state.message}</Message>
    }
}

function Message({
    children,
    role,
}: {
    children: React.ReactNode
    role?: 'alert'
}) {
    return (
        <Text
            accessibilityLiveRegion={role ? 'assertive' : 'polite'}
            accessibilityRole={role ?? 'text'}
            className="text-base text-muted-foreground leading-relaxed"
        >
            {children}
        </Text>
    )
}

function Busy({ label }: { label: string }) {
    return (
        <View className="flex-row items-center gap-3">
            <ActivityIndicator color={colors.primary} />
            <Message>{label}</Message>
        </View>
    )
}
