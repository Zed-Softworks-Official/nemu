import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HARNESS_PLUG } from './fixtures.test-support.ts'
import { mapNode } from './node.ts'
import { mapNodeOrPlaceholder } from './placeholder.ts'

describe('a node that maps to no Device', () => {
    it('is a placeholder Device named after its node ID', () => {
        assert.deepEqual(mapNodeOrPlaceholder('4', {}), [
            {
                id: '4',
                nodeId: '4',
                endpoint: 1,
                kind: 'switch',
                defaultName: 'Matter 4',
                model: 'Matter device',
                description: 'Matter device',
            },
        ])
    })

    it('maps normally once its attributes are known', () => {
        assert.deepEqual(
            mapNodeOrPlaceholder('2', HARNESS_PLUG),
            mapNode('2', HARNESS_PLUG)
        )
    })
})
