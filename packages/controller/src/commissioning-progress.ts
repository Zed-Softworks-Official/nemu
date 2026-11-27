/**
 * Words for commissioning progress, shared by the apps. The steps and
 * reasons are Protocol-neutral (`@nemu/protocol` commissioning-progress.ts),
 * so the same words serve Matter and, later, Zigbee.
 */
import type {
    CommissioningFailureReason,
    CommissioningStep,
} from '@nemu/protocol'

/** What the Owner or Member sees while a step runs. */
export const COMMISSIONING_STEP_LABELS: Record<CommissioningStep, string> = {
    discovering: 'Looking for your Device',
    connecting: 'Connecting securely',
    verifying: 'Checking the Device is genuine',
    configuring_network: 'Sending your Wi‑Fi details',
    joining_network: 'Joining your Home',
    setting_up: 'Setting up the Device',
}

/** Which step failed, for the Owner or Member. */
export function commissioningFailedStepLabel(step: CommissioningStep): string {
    switch (step) {
        case 'discovering':
            return 'Nemu couldn’t find the Device.'
        case 'connecting':
            return 'Nemu found the Device but couldn’t connect to it.'
        case 'verifying':
            return 'The Device couldn’t be verified.'
        case 'configuring_network':
            return 'The Device couldn’t get on your Wi‑Fi.'
        case 'joining_network':
            return 'The Device didn’t finish joining your Home.'
        case 'setting_up':
            return 'The Device joined but couldn’t be set up.'
    }
}

/** What the Owner or Member can do about a failed step. */
export function commissioningFailureGuidance(
    reason: CommissioningFailureReason
): string {
    switch (reason) {
        case 'unreachable':
            return 'Move the Device closer to the Controller, put it back in pairing mode, and try again.'
        case 'network_rejected':
            return 'Check your Wi‑Fi name and password, and use a 2.4 GHz network, not 5 GHz.'
        case 'not_verified':
            return 'Nemu adds only certified Devices. Check that the Controller has Matter trust roots installed, or contact the Device’s maker.'
        case 'timed_out':
            return 'Reset the Device, put it back in pairing mode, and try again.'
        case 'unknown':
            return 'Reset the Device and try again.'
    }
}
