import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nodeIdFromEventData } from './event-id'

describe('nodeIdFromEventData', () => {
    it('reads node_id from an object payload', () => {
        assert.equal(nodeIdFromEventData({ node_id: 52 }), '52')
    })

    it('reads a raw numeric id', () => {
        assert.equal(nodeIdFromEventData(52), '52')
        assert.equal(nodeIdFromEventData(52n), '52')
    })

    it('reads a raw string id', () => {
        assert.equal(nodeIdFromEventData('52'), '52')
    })

    it('ignores empty payloads', () => {
        assert.equal(nodeIdFromEventData(undefined), undefined)
        assert.equal(nodeIdFromEventData(null), undefined)
        assert.equal(nodeIdFromEventData({}), undefined)
        assert.equal(nodeIdFromEventData(''), undefined)
    })
})
