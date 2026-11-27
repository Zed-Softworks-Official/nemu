import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    createMemoryRelayCounter,
    createWebRelayCounter,
    type RelayCounterLocks,
    type RelayCounterStorage,
} from './relay-counter.ts'

/** Web Locks for one origin: one holder per name, the rest queue. */
function fakeLocks(): RelayCounterLocks {
    const tails = new Map<string, Promise<unknown>>()
    return {
        request(name, callback) {
            const previous = tails.get(name) ?? Promise.resolve()
            const run = previous.then(async () => {
                // Yield while holding the lock, so a missing lock would show.
                await new Promise((resolve) => setTimeout(resolve, 1))
                return await callback()
            })
            tails.set(
                name,
                run.catch(() => {})
            )
            return run
        },
    }
}

function fakeStorage(): RelayCounterStorage & { items: Map<string, string> } {
    const items = new Map<string, string>()
    return {
        items,
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => {
            items.set(key, value)
        },
    }
}

describe('Relay counters', () => {
    it('start at 1 and only go up', async () => {
        const counter = createMemoryRelayCounter()
        assert.deepEqual([await counter.next(), await counter.next()], [1, 2])
        await counter.advancePast(100)
        assert.equal(await counter.next(), 101)
        await counter.advancePast(5)
        assert.equal(await counter.next(), 102)
    })

    it('give every tab of one Access Client its own values from one sequence', async () => {
        const locks = fakeLocks()
        const storage = fakeStorage()
        const tab = () =>
            createWebRelayCounter({
                controllerId: 'home-a',
                accessClientId: 'ac-1',
                locks,
                storage,
            })
        const [a, b, c] = [tab(), tab(), tab()]
        const values = await Promise.all(
            [a, b, c, a, b, c, a, b].map((counter) => counter.next())
        )
        assert.deepEqual(
            [...values].sort((x, y) => x - y),
            [1, 2, 3, 4, 5, 6, 7, 8]
        )
        // A tab opened later carries on from the stored value.
        assert.equal(await tab().next(), 9)
        await b.advancePast(40)
        assert.equal(await a.next(), 41)
    })

    it('keep one sequence per Home and Access Client', async () => {
        const locks = fakeLocks()
        const storage = fakeStorage()
        const one = createWebRelayCounter({
            controllerId: 'home-a',
            accessClientId: 'ac-1',
            locks,
            storage,
        })
        const other = createWebRelayCounter({
            controllerId: 'home-b',
            accessClientId: 'ac-1',
            locks,
            storage,
        })
        await one.next()
        await one.next()
        assert.equal(await other.next(), 1)
    })

    it('fall back to memory without Web Locks', async () => {
        const counter = createWebRelayCounter({
            controllerId: 'home-a',
            accessClientId: 'ac-1',
            locks: undefined,
            storage: fakeStorage(),
        })
        assert.equal(await counter.next(), 1)
    })
})
