import assert from 'node:assert/strict'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { NameStore } from './names.ts'
import {
    PENDING_LEAVES_FILE,
    RUST_ARCHIVE_DIR,
    RustAdapterArchive,
} from './rust-adapter-archive.ts'
import { rustFabricNodeIds } from './rust-fabric.ts'

/** Matter TLV, enough to write a `matter-controller` 0.7 snapshot. */
type Tlv =
    | { uint: number }
    | { bytes: number[] }
    | { struct: [number, Tlv][] }
    | { array: Tlv[] }
function tlv(value: Tlv, tag?: number): number[] {
    const tagBytes = tag === undefined ? [] : [tag]
    const control = (type: number) => (tag === undefined ? type : 0x20 | type)
    if ('uint' in value) return [control(0x04), ...tagBytes, value.uint]
    if ('bytes' in value)
        return [control(0x10), ...tagBytes, value.bytes.length, ...value.bytes]
    if ('struct' in value)
        return [
            control(0x15),
            ...tagBytes,
            ...value.struct.flatMap(([t, v]) => tlv(v, t)),
            0x18,
        ]
    return [
        control(0x16),
        ...tagBytes,
        ...value.array.flatMap((v) => tlv(v)),
        0x18,
    ]
}

/** A snapshot with one fabric, its commissioner (node 1) and these Devices. */
function snapshot(nodeIds: number[]): Uint8Array {
    const key = { bytes: [1, 2, 3, 4] }
    return Uint8Array.from(
        tlv({
            struct: [
                [0, { uint: 1 }],
                [
                    1,
                    {
                        array: [
                            {
                                struct: [
                                    [0, { uint: 1 }],
                                    [1, key],
                                    [
                                        4,
                                        {
                                            struct: [
                                                [0, { uint: 1 }],
                                                [1, key],
                                            ],
                                        },
                                    ],
                                    [
                                        5,
                                        {
                                            array: nodeIds.map((id) => ({
                                                struct: [
                                                    [0, { uint: id }],
                                                    [1, key],
                                                ],
                                            })),
                                        },
                                    ],
                                ],
                            },
                        ],
                    },
                ],
            ],
        })
    )
}

const dirs: string[] = []
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true })
})

/** A data dir as the Rust adapter left it: a plug (2), a light (3), a strip (4). */
function rustDataDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'nemu-rust-data-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'controller-state.bin'), snapshot([2, 3, 4]))
    writeFileSync(
        join(dir, 'adopted-nodes.json'),
        JSON.stringify({ node_ids: [3] })
    )
    writeFileSync(
        join(dir, 'names.json'),
        JSON.stringify({ names: { '2': 'Kitchen', '4#2': 'Fan', '5:1': 'Up' } })
    )
    writeFileSync(
        join(dir, 'meter-observations.json'),
        JSON.stringify({
            sequence: 43,
            publications: {
                '2': {
                    fingerprint: 'power|device|=60000',
                    observedAt: '2026-11-27T03:28:47Z',
                    observationId: '2:1795750127185:42',
                },
            },
        })
    )
    return dir
}

describe('rustFabricNodeIds', () => {
    it('reads the Device node IDs, not the commissioner', () => {
        assert.deepEqual(rustFabricNodeIds(snapshot([2, 3])), ['2', '3'])
    })

    it('refuses bytes that are not a snapshot', () => {
        assert.throws(() => rustFabricNodeIds(Uint8Array.from([0x15, 0x24])))
    })
})

describe('RustAdapterArchive', () => {
    it('names every Device ID the Rust stores hold, once each', () => {
        const archive = RustAdapterArchive.prepare(rustDataDir())
        assert.deepEqual([...archive.pendingDeviceIds].sort(), [
            '2',
            '3',
            '4',
            '5:1',
        ])
    })

    it('moves the Rust files into the archive', () => {
        const dir = rustDataDir()
        RustAdapterArchive.prepare(dir)
        assert.deepEqual(readdirSync(dir), [RUST_ARCHIVE_DIR])
        assert.deepEqual(readdirSync(join(dir, RUST_ARCHIVE_DIR)).sort(), [
            'adopted-nodes.json',
            'controller-state.bin',
            'meter-observations.json',
            'names.json',
            PENDING_LEAVES_FILE,
        ])
    })

    it('leaves no Rust name for a fresh matter.js node to inherit', () => {
        const dir = rustDataDir()
        RustAdapterArchive.prepare(dir)
        assert.equal(NameStore.load(dir).get('2'), undefined)
    })

    it('announces the old Devices once', () => {
        const dir = rustDataDir()
        const first = RustAdapterArchive.prepare(dir)
        first.announced()
        assert.deepEqual(RustAdapterArchive.prepare(dir).pendingDeviceIds, [])
    })

    it('announces them again after a crash before they were published', () => {
        const dir = rustDataDir()
        RustAdapterArchive.prepare(dir)
        // matter.js started, then the process died before MQTT connected.
        mkdirSync(join(dir, 'matter'))
        assert.equal(RustAdapterArchive.prepare(dir).pendingDeviceIds.length, 4)
    })

    it('leaves a matter.js data dir alone, though names.json has the Rust name', () => {
        const dir = mkdtempSync(join(tmpdir(), 'nemu-matterjs-data-'))
        dirs.push(dir)
        mkdirSync(join(dir, 'matter'))
        const names = JSON.stringify({ names: { '1': 'Desk' } })
        writeFileSync(join(dir, 'names.json'), names)
        const archive = RustAdapterArchive.prepare(dir)
        assert.deepEqual(archive.pendingDeviceIds, [])
        assert.equal(readFileSync(join(dir, 'names.json'), 'utf8'), names)
        assert.ok(!existsSync(join(dir, RUST_ARCHIVE_DIR)))
    })

    it('does nothing for an empty data dir', () => {
        const dir = mkdtempSync(join(tmpdir(), 'nemu-empty-data-'))
        dirs.push(dir)
        assert.deepEqual(RustAdapterArchive.prepare(dir).pendingDeviceIds, [])
        assert.deepEqual(readdirSync(dir), [])
    })

    it('archives a Rust store it cannot read, naming no IDs from it', () => {
        const dir = rustDataDir()
        writeFileSync(join(dir, 'controller-state.bin'), 'not tlv')
        const archive = RustAdapterArchive.prepare(dir)
        assert.deepEqual([...archive.pendingDeviceIds].sort(), [
            '2',
            '3',
            '4',
            '5:1',
        ])
        assert.ok(
            existsSync(join(dir, RUST_ARCHIVE_DIR, 'controller-state.bin'))
        )
    })
})
