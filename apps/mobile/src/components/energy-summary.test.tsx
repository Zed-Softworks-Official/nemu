import { ControllerProvider, useController } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type {
    CapabilityCurrentState,
    HistoryQuery,
    HistoryQueryRead,
    HistoryQueryResult,
    HomeMeterDesignation,
} from '@nemu/protocol'
import { act, render, screen, within } from '@testing-library/react-native'
import { useEffect } from 'react'

import { EnergySummaryView } from '~/components/energy-summary'
import { HomeControlProvider } from '~/components/home-control'

const POWER_ID = '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32'
const IMPORTED_ID = '6f1d7c6a-6a2e-4d0a-9c3e-3d6c1b9a4e21'
const EXPORTED_ID = '8a4c2e10-1b2c-4d3e-9f01-223344556677'

const METER: HomeMeterDesignation = {
    id: '11111111-2222-4333-8444-555555555555',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveUntil: null,
    powerCapabilityId: POWER_ID,
    importedEnergyCapabilityId: IMPORTED_ID,
    exportedEnergyCapabilityId: EXPORTED_ID,
    protocol: 'zigbee',
    deviceExternalId: 'meter-ext',
    componentPath: [],
    physicalScopeKind: 'device',
    physicalScopeComponentId: '',
}

type Series = HistoryQueryResult['series'][number]
type Point = Series['points'][number]

function point(value: number, covered = true): Point {
    return {
        start: '2026-11-22T00:00:00.000Z',
        end: '2026-11-22T00:15:00.000Z',
        value,
        scale: 0,
        provenance: 'measured',
        coverage: { coveredNs: covered ? 1 : 0, elapsedNs: 1 },
    }
}

function series(
    capabilityId: string,
    points: Point[],
    coverage = { coveredNs: 10, elapsedNs: 10 }
): Series {
    return {
        capabilityId,
        label:
            capabilityId === IMPORTED_ID ? 'importedEnergy' : 'exportedEnergy',
        resolution: 'fifteen_minute',
        sourceResolution: 'fifteen_minute',
        provenance: 'measured',
        coverage,
        recordingSince: '2026-01-01T00:00:00.000Z',
        availableSince: '2026-01-01T00:00:00.000Z',
        meterEpochBoundaries: [],
        designationBoundaries: [],
        gaps: [],
        missing: [],
        points,
    }
}

function answer(seriesList: Series[]): HistoryQueryRead {
    return {
        type: 'historyQueryResult',
        requestId: 'history',
        asOf: '2026-11-22T15:00:00.000Z',
        incomplete: false,
        series: seriesList,
        reasons: [],
    }
}

/** Imported 1.5 kWh and Exported 0.25 kWh, fully covered. */
function fullDay(query: HistoryQuery): HistoryQueryRead {
    return query.metric === 'importedEnergy'
        ? answer([series(IMPORTED_ID, [point(1200), point(300)])])
        : answer([series(EXPORTED_ID, [point(250)])])
}

function powerReading(watts: number): CapabilityCurrentState {
    return {
        capabilityId: POWER_ID,
        device: { protocol: 'zigbee', externalId: 'meter-ext' },
        physicalScope: { kind: 'device' },
        kind: 'power',
        value: { value: watts, scale: 0 },
        availability: { status: 'available' },
        revision: 1,
    } as unknown as CapabilityCurrentState
}

let reprobe: () => Promise<void>

function CaptureReprobe() {
    const controller = useController()
    useEffect(() => {
        reprobe = controller.reprobe
    }, [controller])
    return null
}

async function renderEnergy(controller: FakeController) {
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    await render(
        <ControllerProvider
            connectors={fakeControllerConnectors(controller)}
            controllerId={controller.controllerId}
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            <CaptureReprobe />
            <HomeControlProvider>
                <EnergySummaryView />
            </HomeControlProvider>
        </ControllerProvider>
    )
}

async function emitPower(controller: FakeController, watts: number) {
    await act(async () => {
        controller.emit({
            type: 'capabilitySnapshot',
            epoch: 'epoch-1',
            revision: 1,
            capabilities: [powerReading(watts)],
        } as never)
    })
}

describe.each([
    { transport: 'LAN', lanReachable: true, banner: 'At home' },
    { transport: 'Relay', lanReachable: false, banner: 'Away from home' },
])('the Energy summary over $transport', ({
    transport,
    lanReachable,
    banner,
}) => {
    function home(options?: {
        homeMeter?: HomeMeterDesignation | null
        history?: (query: HistoryQuery) => HistoryQueryRead
    }) {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            lanReachable,
            homeMeter:
                options?.homeMeter === undefined ? METER : options.homeMeter,
        })
        controller.history = options?.history ?? fullDay
        return controller
    }

    it('says when no Home meter is set, in words true for every role', async () => {
        await renderEnergy(home({ homeMeter: null }))
        await screen.findByText(banner)

        await screen.findByText(
            'No Home meter is set. An Owner can set one on the dashboard.'
        )
        expect(screen.queryByText(/kWh/)).toBeNull()
    })

    it('shows current Home power from the Home meter', async () => {
        const controller = home()
        await renderEnergy(controller)
        await screen.findByText(banner)
        await emitPower(controller, 1234)

        const power = await screen.findByLabelText('Current Home power')
        expect(within(power).getByText('1,234 W')).toBeTruthy()
        expect(within(power).getByText('Importing')).toBeTruthy()
    })

    it('shows today’s Imported and Exported energy separately', async () => {
        const controller = home()
        await renderEnergy(controller)

        const imported = await screen.findByLabelText('Imported today')
        const exported = screen.getByLabelText('Exported today')
        expect(within(imported).getByText('1.5 kWh')).toBeTruthy()
        expect(within(exported).getByText('0.25 kWh')).toBeTruthy()
        expect(screen.queryByText(/incomplete/i)).toBeNull()
        expect(
            controller.historyQueries.map(({ query, via }) => [
                query.metric,
                via,
            ])
        ).toEqual(
            expect.arrayContaining([
                ['importedEnergy', transport.toLowerCase()],
                ['exportedEnergy', transport.toLowerCase()],
            ])
        )
    })

    it('flags incomplete History coverage for today', async () => {
        await renderEnergy(
            home({
                history: (query) =>
                    query.metric === 'importedEnergy'
                        ? answer([
                              series(
                                  IMPORTED_ID,
                                  [point(1500), point(0, false)],
                                  { coveredNs: 1, elapsedNs: 2 }
                              ),
                          ])
                        : fullDay(query),
            })
        )

        const imported = await screen.findByLabelText('Imported today')
        expect(within(imported).getByText('1.5 kWh')).toBeTruthy()
        expect(
            within(imported).getByText(
                'Incomplete: History covers 50% of today. Missing periods are not counted.'
            )
        ).toBeTruthy()
        const exported = screen.getByLabelText('Exported today')
        expect(within(exported).queryByText(/Incomplete/)).toBeNull()
    })

    it('never shows missing intervals or History gaps as zero', async () => {
        await renderEnergy(
            home({
                history: (query) =>
                    query.metric === 'importedEnergy'
                        ? answer([
                              series(IMPORTED_ID, [point(0, false)], {
                                  coveredNs: 0,
                                  elapsedNs: 1,
                              }),
                          ])
                        : answer([]),
            })
        )

        const imported = await screen.findByLabelText('Imported today')
        const exported = screen.getByLabelText('Exported today')
        expect(within(imported).getByText('Unknown')).toBeTruthy()
        expect(within(exported).getByText('Unknown')).toBeTruthy()
        expect(screen.queryByText('0 kWh')).toBeNull()
        expect(within(imported).getByText(/Incomplete/)).toBeTruthy()
    })

    it('says when today’s History could not be loaded, without inventing zero', async () => {
        await renderEnergy(
            home({
                history: () => {
                    throw new Error('History store unavailable')
                },
            })
        )

        await screen.findByText('Today’s energy could not be loaded')
        expect(screen.queryByText(/kWh/)).toBeNull()
    })

    it('keeps the last figures, marked stale, when the Controller becomes unreachable', async () => {
        const controller = home()
        await renderEnergy(controller)
        await emitPower(controller, 1234)
        await screen.findByLabelText('Imported today')
        await screen.findByText('1,234 W')

        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Can’t reach the Controller')

        const imported = screen.getByLabelText('Imported today')
        expect(within(imported).getByText('1.5 kWh')).toBeTruthy()
        expect(within(imported).getByText('Last known')).toBeTruthy()
        const power = screen.getByLabelText('Current Home power')
        expect(within(power).getByText('1,234 W')).toBeTruthy()
        expect(within(power).getByText('Last known')).toBeTruthy()
    })
})

it('shows no figures when the Controller was never reached', async () => {
    await renderEnergy(
        new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            lanReachable: false,
            relayReachable: false,
            homeMeter: METER,
        })
    )

    await screen.findByText('Can’t reach the Controller')
    expect(screen.queryByText(/kWh/)).toBeNull()
    expect(screen.queryByText(/No Home meter/)).toBeNull()
    expect(
        screen.getByText(
            'Energy appears when this phone reaches the Controller.'
        )
    ).toBeTruthy()
})
