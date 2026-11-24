import { useController } from '@nemu/controller'
import type { HealthSummary } from '@nemu/protocol'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { OwnerOnly } from '~/components/membership-role'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { errorMessage } from '~/lib/connection'

type OwnerHealthSummary = Extract<HealthSummary, { view: 'owner' }>

type HealthRead =
    | { kind: 'reading' }
    | { kind: 'read'; summary: HealthSummary }
    | { kind: 'failed'; message: string }

/**
 * The summary's `status` covers only the database and MQTT, so it can be `ok`
 * while Zigbee or Matter is not.
 */
function overallHealth({ services, controller }: OwnerHealthSummary): string {
    if (!controller.database) return 'Error'
    return services.mqtt && services.zigbee && services.matter
        ? 'OK'
        : 'Some services unavailable'
}

/**
 * Relay status and the Controller health summary, over LAN or Relay. Only
 * Owners see them, and only an Owner's phone asks for them (NEM-97).
 */
export function HealthSettings() {
    return (
        <OwnerOnly>
            <OwnerHealth />
        </OwnerOnly>
    )
}

/**
 * The role is only known while connected, so this mounts after connecting and
 * goes away with the connection instead of showing old readings.
 */
function OwnerHealth() {
    const { status, getHealthSummary } = useController()
    const [read, setRead] = useState<HealthRead>({ kind: 'reading' })
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        let current = true
        setRead({ kind: 'reading' })
        getHealthSummary().then(
            (summary) => {
                if (current) setRead({ kind: 'read', summary })
            },
            (cause: unknown) => {
                if (!current) return
                setRead({
                    kind: 'failed',
                    message: errorMessage(
                        cause,
                        'Could not read the Controller health'
                    ),
                })
            }
        )
        return () => {
            current = false
        }
    }, [getHealthSummary, status.mode, attempt])

    // The Controller decides the view; a Member view has nothing to show here.
    if (read.kind === 'read' && read.summary.view !== 'owner') return null

    return (
        <View className="gap-2">
            <Text className="font-semibold text-foreground text-lg">
                Controller health
            </Text>
            {read.kind === 'reading' ? (
                <Text className="text-muted-foreground text-sm">
                    Reading the Controller health…
                </Text>
            ) : read.kind === 'failed' ? (
                <Text accessibilityRole="alert" className="text-sm">
                    {read.message}
                </Text>
            ) : read.summary.view === 'owner' ? (
                <HealthRows summary={read.summary} />
            ) : null}
            <View className="flex-row">
                <Button
                    disabled={read.kind === 'reading'}
                    onPress={() => setAttempt((count) => count + 1)}
                    title="Check health again"
                    variant="outline"
                />
            </View>
        </View>
    )
}

function HealthRows({ summary }: { summary: OwnerHealthSummary }) {
    const { services, devices, controller } = summary
    return (
        <>
            <HealthRow
                label="Relay"
                value={controller.relayConnected ? 'Connected' : 'Disconnected'}
            />
            <HealthRow label="Controller" value={overallHealth(summary)} />
            <HealthRow label="MQTT" value={availability(services.mqtt)} />
            <HealthRow label="Zigbee" value={availability(services.zigbee)} />
            <HealthRow label="Matter" value={availability(services.matter)} />
            <HealthRow
                label="Database"
                value={availability(controller.database)}
            />
            <HealthRow
                label="Devices"
                value={`${devices.online} of ${devices.total} online`}
            />
        </>
    )
}

function availability(available: boolean): string {
    return available ? 'Available' : 'Unavailable'
}

function HealthRow({ label, value }: { label: string; value: string }) {
    return (
        <View
            accessibilityLabel={`${label}: ${value}`}
            accessible
            className="flex-row justify-between gap-4"
        >
            <Text className="text-muted-foreground text-sm">{label}</Text>
            <Text className="text-foreground text-sm">{value}</Text>
        </View>
    )
}
