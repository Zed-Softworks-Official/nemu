import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attestationDecision, type Finding } from './attestation.ts'

const TEST_DEVICE: Finding[] = [
    { level: 'warning', type: 'DclServiceUnavailable', message: 'no DCL' },
    {
        level: 'warning',
        type: 'CdSignerVerificationSkipped',
        message: 'skipped',
    },
    { level: 'info', type: 'CertificationTypeTest', message: 'test CD' },
]

describe('attestationDecision', () => {
    it('refuses a Device with a test Certification Declaration by default', () => {
        const decision = attestationDecision(TEST_DEVICE, false)
        assert.equal(decision.accept, false)
        assert.match(
            decision.accept ? '' : decision.reason,
            /CertificationTypeTest/
        )
    })

    it('refuses a PAA trusted only as a test certificate', () => {
        const decision = attestationDecision(
            [
                {
                    level: 'warning',
                    type: 'TrustedAsTestCertificate',
                    message: 'test PAA',
                },
            ],
            false
        )
        assert.equal(decision.accept, false)
    })

    it('refuses any error-level finding', () => {
        const decision = attestationDecision(
            [{ level: 'error', type: 'PaaNotTrusted', message: 'unknown PAA' }],
            false
        )
        assert.equal(decision.accept, false)
    })

    it('accepts a production Device whose findings are only warnings', () => {
        const decision = attestationDecision(
            [
                {
                    level: 'warning',
                    type: 'CertificateIdNotVerified',
                    message: 'x',
                },
            ],
            false
        )
        assert.deepEqual(decision, { accept: true })
    })

    it('accepts test certificates only when explicitly allowed', () => {
        assert.deepEqual(attestationDecision(TEST_DEVICE, true), {
            accept: true,
        })
        assert.deepEqual(
            attestationDecision(
                [{ level: 'error', type: 'PaaNotTrusted', message: 'x' }],
                true
            ),
            { accept: true }
        )
    })
})
