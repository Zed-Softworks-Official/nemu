import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    classifyCommissionError,
    classifyFailure,
    humanCommissionError,
} from './commissioning.ts'

describe('classifyCommissionError', () => {
    // The messages are the Rust adapter's Owner- or Member-facing text,
    // unchanged.
    it('keeps the Rust adapter messages', () => {
        assert.equal(
            humanCommissionError('device attestation failed: PaaNotTrusted'),
            'This device could not be verified. Check that Nemu has Matter trust roots installed.'
        )
        assert.equal(
            humanCommissionError('wifi association failed'),
            'Use the 2.4 GHz network, not 5 GHz, and try again.'
        )
        assert.equal(
            humanCommissionError('CASE session establishment failed'),
            'The device was found but did not finish joining. Put it back in pairing mode and keep it near the controller.'
        )
        assert.equal(
            humanCommissionError('operation timed out'),
            'Pairing timed out. Put the device back in pairing mode and keep it near the controller.'
        )
        assert.equal(
            humanCommissionError('something odd'),
            'Put the device back in pairing mode and try again.'
        )
    })

    it('gives the step and the message from one rule', () => {
        // The step and the message used to disagree on a BTP handshake.
        assert.deepEqual(classifyCommissionError('BTP handshake failed'), {
            kind: 'pase_session',
            step: 'connecting',
            reason: 'unreachable',
            message:
                'The device was found but did not finish joining. Put it back in pairing mode and keep it near the controller.',
        })
        assert.equal(
            classifyCommissionError('CASE session establishment failed')?.step,
            'joining_network'
        )
    })

    it('places attestation first, since it never falls back', () => {
        assert.equal(
            classifyCommissionError('attestation timed out on wifi')?.kind,
            'attestation'
        )
    })

    it('places nothing it has no rule for', () => {
        assert.equal(classifyCommissionError('something odd'), undefined)
    })
})

describe('classifyFailure', () => {
    it('fails the step reached before matter.js when the error names none', () => {
        assert.deepEqual(classifyFailure('something odd', 'connecting'), {
            step: 'connecting',
            reason: 'unreachable',
        })
        assert.deepEqual(classifyFailure('timed out', 'connecting'), {
            step: 'connecting',
            reason: 'timed_out',
        })
    })

    it('names configuring_network only when Wi-Fi was sent', () => {
        assert.deepEqual(classifyFailure('Wi-Fi rejected', 'connecting'), {
            step: 'configuring_network',
            reason: 'network_rejected',
        })
        assert.deepEqual(
            classifyFailure('Wi-Fi rejected', 'connecting', false),
            { step: 'connecting', reason: 'unreachable' }
        )
    })
})
