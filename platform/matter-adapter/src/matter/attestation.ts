/**
 * Whether a Device's attestation findings let commissioning go on. Pure, so
 * the trust policy is tested without matter.js.
 *
 * Production (the default) refuses any error-level finding and any sign of a
 * test certificate. Dev/test runs (`MATTER_ALLOW_EXAMPLE_ROOTS`) accept
 * everything, as the Rust adapter's example roots did.
 */

/** A matter.js attestation finding, as far as the policy reads it. */
export interface Finding {
    level: 'error' | 'warning' | 'info'
    /** matter.js `DeviceAttestationCheck`, for example `PaaNotTrusted`. */
    type: string
    message: string
}

/** Findings that mean the Device is certified with test certificates. */
const TEST_CERTIFICATE_FINDINGS = new Set([
    'CertificationTypeTest',
    'TrustedAsTestCertificate',
])

export type AttestationDecision =
    | { accept: true }
    | { accept: false; reason: string }

export function attestationDecision(
    findings: readonly Finding[],
    allowTestCertificates: boolean
): AttestationDecision {
    if (allowTestCertificates) return { accept: true }
    const refused = findings.find(
        (finding) =>
            finding.level === 'error' ||
            TEST_CERTIFICATE_FINDINGS.has(finding.type)
    )
    return refused
        ? {
              accept: false,
              reason: `device attestation failed: ${refused.type}: ${refused.message}`,
          }
        : { accept: true }
}
