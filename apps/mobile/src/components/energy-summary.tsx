import { useController } from '@nemu/controller'
import {
    type EnergySummary,
    formatEnergy,
    formatPower,
    liveDesignatedPower,
    livePowerFlowLabel,
    loadTodayEnergy,
    type TodayEnergy,
} from '@nemu/controller/energy'
import type { HomeMeterDesignation } from '@nemu/protocol'
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'

import { ConnectionBanner } from '~/components/control-surface'
import { useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'

type Loaded<T> = { status: 'loaded'; value: T } | { status: 'failed' }

/**
 * A focused summary of Home energy (ADR-0031): current Home power and
 * today's Imported and Exported energy from the Home meter. Detailed History
 * stays on the dashboard. Figures come from the same shared logic as the
 * dashboard and are kept in memory only.
 */
export function EnergySummaryView() {
    const { live, capabilities, capabilitiesCurrent } = useHomeControl()
    const { getHomeMeterDesignation, queryHistory } = useController()
    const [meter, setMeter] = useState<
        Loaded<HomeMeterDesignation | null> | undefined
    >(undefined)
    const [today, setToday] = useState<Loaded<TodayEnergy> | undefined>(
        undefined
    )
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        if (!live) return
        let cancelled = false
        void (async () => {
            let designation: HomeMeterDesignation | null
            try {
                designation = await getHomeMeterDesignation()
            } catch {
                if (!cancelled) setMeter({ status: 'failed' })
                return
            }
            if (cancelled) return
            setMeter({ status: 'loaded', value: designation })
            if (designation === null) {
                setToday(undefined)
                return
            }
            try {
                const value = await loadTodayEnergy({
                    designation,
                    queryHistory,
                    now: new Date(),
                })
                if (!cancelled) setToday({ status: 'loaded', value })
            } catch {
                if (!cancelled) setToday({ status: 'failed' })
            }
        })()
        return () => {
            cancelled = true
        }
    }, [attempt, getHomeMeterDesignation, live, queryHistory])

    const retry = () => setAttempt((value) => value + 1)
    const designation = meter?.status === 'loaded' ? meter.value : undefined

    return (
        <ScrollView contentContainerClassName="gap-4 pb-8">
            <ConnectionBanner />
            {meter === undefined ? (
                live ? (
                    <ActivityIndicator color={colors.primary} />
                ) : (
                    <Text className="text-muted-foreground text-sm">
                        Energy appears when this phone reaches the Controller.
                    </Text>
                )
            ) : null}
            {meter?.status === 'failed' && designation === undefined ? (
                <Failure
                    onRetry={live ? retry : undefined}
                    title="The Home meter could not be loaded"
                />
            ) : null}
            {designation === null ? (
                <Text className="text-muted-foreground text-sm leading-relaxed">
                    No Home meter is set. An Owner can set one on the dashboard.
                </Text>
            ) : null}
            {designation ? (
                <>
                    <PowerCard
                        current={capabilitiesCurrent}
                        reading={liveDesignatedPower(
                            capabilities,
                            designation.powerCapabilityId
                        )}
                        reported={designation.powerCapabilityId !== null}
                    />
                    {today === undefined && live ? (
                        <ActivityIndicator color={colors.primary} />
                    ) : null}
                    {today?.status === 'failed' ? (
                        <Failure
                            onRetry={live ? retry : undefined}
                            title="Today’s energy could not be loaded"
                        />
                    ) : null}
                    {today?.status === 'loaded' ? (
                        <>
                            <TodayCard
                                current={live}
                                label="Imported today"
                                summary={today.value.imported}
                            />
                            <TodayCard
                                current={live}
                                label="Exported today"
                                summary={today.value.exported}
                            />
                        </>
                    ) : null}
                    <Text className="text-muted-foreground text-xs leading-relaxed">
                        Today runs from midnight, the same as on the dashboard.
                        Detailed History is on the dashboard.
                    </Text>
                </>
            ) : null}
        </ScrollView>
    )
}

function PowerCard({
    reading,
    reported,
    current,
}: {
    reading: ReturnType<typeof liveDesignatedPower>
    reported: boolean
    current: boolean
}) {
    return (
        <Card
            label="Current Home power"
            status={
                !reported
                    ? undefined
                    : reading && !current
                      ? 'Last known'
                      : reading
                        ? livePowerFlowLabel(reading.flow)
                        : 'Unavailable'
            }
            value={
                !reported
                    ? 'Not reported'
                    : reading
                      ? formatPower(reading.watts)
                      : 'Unknown'
            }
        >
            {reported ? null : (
                <Note>This Home meter does not report power.</Note>
            )}
        </Card>
    )
}

function TodayCard({
    label,
    summary,
    current,
}: {
    label: string
    summary: EnergySummary | null
    current: boolean
}) {
    if (summary === null) {
        return (
            <Card label={label} value="Not reported">
                <Note>This Home meter does not report it.</Note>
            </Card>
        )
    }
    return (
        <Card
            label={label}
            status={
                current
                    ? summary.kind === 'measured'
                        ? 'Measured'
                        : 'Estimated'
                    : 'Last known'
            }
            value={
                summary.quantityKwh === null
                    ? 'Unknown'
                    : formatEnergy(summary.quantityKwh)
            }
        >
            {summary.coverageComplete ? null : (
                <Text className="text-sm text-warning leading-relaxed">
                    {summary.coverageLabel === 'Unknown'
                        ? 'Incomplete: History coverage for today is unknown. Missing periods are not counted.'
                        : `Incomplete: History covers ${summary.coverageLabel} of today. Missing periods are not counted.`}
                </Text>
            )}
        </Card>
    )
}

function Card({
    label,
    value,
    status,
    children,
}: {
    label: string
    value: string
    status?: string
    children?: React.ReactNode
}) {
    return (
        <View
            accessibilityLabel={label}
            className="gap-2 rounded-sm border border-border p-4"
        >
            <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
                    {label}
                </Text>
                {status ? (
                    <Text className="text-muted-foreground text-xs">
                        {status}
                    </Text>
                ) : null}
            </View>
            <Text className="font-semibold text-2xl text-foreground">
                {value}
            </Text>
            {children}
        </View>
    )
}

function Note({ children }: { children: React.ReactNode }) {
    return (
        <Text className="text-muted-foreground text-sm leading-relaxed">
            {children}
        </Text>
    )
}

function Failure({ title, onRetry }: { title: string; onRetry?: () => void }) {
    return (
        <View
            accessibilityRole="alert"
            className="gap-3 rounded-sm border border-destructive/40 p-4"
        >
            <Text className="font-medium text-foreground">{title}</Text>
            <Text className="text-muted-foreground text-sm leading-relaxed">
                No figure is shown rather than a guess.
            </Text>
            {onRetry ? (
                <View className="flex-row">
                    <Button
                        onPress={onRetry}
                        title="Try again"
                        variant="outline"
                    />
                </View>
            ) : null}
        </View>
    )
}
