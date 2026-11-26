/**
 * One simulated Matter Device, run as its own process so the harness can take
 * it offline (kill it) and bring it back (start it again on the same storage).
 *
 *   node dist/device.js <plug|light> <storageDir> <port> <discriminator> <passcode>
 *
 * Prints one JSON line `{"ready":true,"manualPairingCode":...}` on stdout once
 * it is advertising. Reads JSON lines on stdin:
 *   {"op":"power","activePower":<mW>,"voltage":<mV>,"activeCurrent":<mA>,"energyImported":<mWh>}
 */
import { createInterface } from 'node:readline'
import {
    DeviceTypeId,
    Environment,
    Logger,
    LogLevel,
    ServerNode,
    VendorId,
} from '@matter/main'
import { ElectricalEnergyMeasurementServer } from '@matter/main/behaviors/electrical-energy-measurement'
import { ElectricalPowerMeasurementServer } from '@matter/main/behaviors/electrical-power-measurement'
import { NetworkCommissioningServer } from '@matter/main/behaviors/network-commissioning'
import { PowerTopologyServer } from '@matter/main/behaviors/power-topology'
import { ElectricalPowerMeasurement } from '@matter/main/clusters/electrical-power-measurement'
import { ColorTemperatureLightDevice } from '@matter/main/devices/color-temperature-light'
import { OnOffPlugInUnitDevice } from '@matter/main/devices/on-off-plug-in-unit'
import { ElectricalSensorEndpoint } from '@matter/main/endpoints/electrical-sensor'
import { MeasurementType } from '@matter/main/types'
import { DEVICE_FIXTURES, type DeviceKind } from './fixtures.ts'

const [kindArg, storageDir, portArg, discriminatorArg, passcodeArg] =
    process.argv.slice(2)
if ((kindArg !== 'plug' && kindArg !== 'light') || storageDir === undefined) {
    throw new Error(`unknown device kind ${kindArg}`)
}
const kind: DeviceKind = kindArg
const fixture = DEVICE_FIXTURES[kind]

Logger.level = LogLevel.WARN
const environment = Environment.default
environment.vars.set('storage.path', storageDir)

const PowerServer = ElectricalPowerMeasurementServer.with('AlternatingCurrent')
const EnergyServer = ElectricalEnergyMeasurementServer.with(
    'ImportedEnergy',
    'CumulativeEnergy'
)
const SensorEndpoint = ElectricalSensorEndpoint.with(
    PowerTopologyServer.with('NodeTopology'),
    PowerServer,
    EnergyServer
)

const accuracyRange = {
    rangeMin: -1_000_000_000,
    rangeMax: 1_000_000_000,
    fixedMax: 1,
}

// An on-network Device still reports NetworkCommissioning on its root endpoint,
// and the Rust commissioner reads its FeatureMap.
const RootEndpoint = ServerNode.RootEndpoint.with(
    NetworkCommissioningServer.with('EthernetNetworkInterface')
)

const node = await ServerNode.create(RootEndpoint, {
    id: `nemu-harness-${kind}`,
    network: { port: Number(portArg) },
    commissioning: {
        passcode: Number(passcodeArg),
        discriminator: Number(discriminatorArg),
    },
    productDescription: {
        name: fixture.productName,
        deviceType: DeviceTypeId(fixture.deviceType),
    },
    basicInformation: {
        vendorName: 'Nemu Harness',
        vendorId: VendorId(0xfff1),
        productName: fixture.productName,
        productId: fixture.productId,
        nodeLabel: '',
        serialNumber: `nemu-harness-${kind}`,
        uniqueId: `nemu-harness-unique-${kind}`,
    },
    networkCommissioning: {
        maxNetworks: 1,
        interfaceEnabled: true,
        lastConnectErrorValue: null,
        lastNetworkId: null,
        lastNetworkingStatus: null,
        networks: [
            { networkId: new TextEncoder().encode('eth0'), connected: true },
        ],
    },
})

if (kind === 'plug') {
    await node.add(OnOffPlugInUnitDevice, {
        id: 'outlet',
        onOff: { onOff: false },
    })
    const power = fixture.power
    const sensor = await node.add(SensorEndpoint, {
        id: 'meter',
        electricalPowerMeasurement: {
            powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
            numberOfMeasurementTypes: 3,
            accuracy: [
                MeasurementType.ActivePower,
                MeasurementType.Voltage,
                MeasurementType.ActiveCurrent,
            ].map((measurementType) => ({
                measurementType,
                measured: true,
                minMeasuredValue: -1_000_000_000,
                maxMeasuredValue: 1_000_000_000,
                accuracyRanges: [accuracyRange],
            })),
            activePower: power.activePower,
            voltage: power.voltage,
            activeCurrent: power.activeCurrent,
        },
        electricalEnergyMeasurement: {
            accuracy: {
                measurementType: MeasurementType.ElectricalEnergy,
                measured: true,
                minMeasuredValue: 0,
                maxMeasuredValue: 1_000_000_000_000,
                accuracyRanges: [
                    { rangeMin: 0, rangeMax: 1_000_000_000_000, fixedMax: 1 },
                ],
            },
            cumulativeEnergyImported: { energy: power.energyImported },
        },
    })
    const commands = createInterface({ input: process.stdin })
    commands.on('line', (line) => {
        const command = JSON.parse(line) as {
            op: string
            activePower: number
            voltage: number
            activeCurrent: number
            energyImported: number
        }
        if (command.op !== 'power') return
        void sensor
            .set({
                electricalPowerMeasurement: {
                    activePower: command.activePower,
                    voltage: command.voltage,
                    activeCurrent: command.activeCurrent,
                },
                electricalEnergyMeasurement: {
                    cumulativeEnergyImported: {
                        energy: command.energyImported,
                    },
                },
            })
            .then(() =>
                process.stdout.write(
                    `${JSON.stringify({ applied: 'power' })}\n`
                )
            )
    })
} else {
    const light = fixture.light
    await node.add(ColorTemperatureLightDevice, {
        id: 'lamp',
        onOff: { onOff: false },
        levelControl: {
            currentLevel: light.level,
            minLevel: light.minLevel,
            maxLevel: light.maxLevel,
        },
        colorControl: {
            colorMode: 2,
            enhancedColorMode: 2,
            colorTemperatureMireds: light.mireds,
            colorTempPhysicalMinMireds: light.minMireds,
            colorTempPhysicalMaxMireds: light.maxMireds,
            coupleColorTempToLevelMinMireds: light.minMireds,
            startUpColorTemperatureMireds: null,
        },
    })
}

await node.start()
const state = node.state.commissioning
process.stdout.write(
    `${JSON.stringify({
        ready: true,
        commissioned: state.commissioned,
        manualPairingCode: state.pairingCodes.manualPairingCode,
        qrPairingCode: state.pairingCodes.qrPairingCode,
    })}\n`
)

const stop = () => {
    void node.close().finally(() => process.exit(0))
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
