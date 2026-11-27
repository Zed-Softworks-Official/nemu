import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    applyScope,
    FULL_SCOPE,
    includesTopic,
    isFullScope,
    type ScopedStep,
    scopeFromEnv,
    unknownSteps,
} from './scope.ts'

const run: ScopedStep[] = [
    {
        step: 'commission-plug',
        messages: {
            '<plug>': [{ state: 'OFF' }],
            '<plug>/observations': [{}],
            '<plug>/capabilities': [{}],
            'bridge/response/commission': [{ status: 'ok' }],
        },
    },
    { step: 'plug-load-changes', messages: { '<plug>/observations': [{}] } },
]

test('the default scope is the whole scenario', () => {
    const scope = scopeFromEnv({})
    assert.ok(isFullScope(scope))
    assert.deepEqual(applyScope(run, scope), run)
})

test('reads steps and ignored topics from the environment', () => {
    const scope = scopeFromEnv({
        MATTER_HARNESS_STEPS: 'commission-plug, plug-on',
        MATTER_HARNESS_IGNORE_TOPICS: 'observations,capabilities',
    })
    assert.deepEqual([...(scope.steps ?? [])], ['commission-plug', 'plug-on'])
    assert.deepEqual(scope.ignoredTopics, ['observations', 'capabilities'])
    assert.ok(!isFullScope(scope))
})

test('keeps only the steps and topics in scope', () => {
    const scope = scopeFromEnv({
        MATTER_HARNESS_STEPS: 'commission-plug',
        MATTER_HARNESS_IGNORE_TOPICS: 'observations,capabilities',
    })
    assert.deepEqual(applyScope(run, scope), [
        {
            step: 'commission-plug',
            messages: {
                '<plug>': [{ state: 'OFF' }],
                'bridge/response/commission': [{ status: 'ok' }],
            },
        },
    ])
})

test('matches a whole topic or a topic leaf, not a substring', () => {
    const scope = { ignoredTopics: ['bridge/event', 'observations'] }
    assert.ok(!includesTopic(scope, 'bridge/event'))
    assert.ok(!includesTopic(scope, '<plug>/observations'))
    assert.ok(includesTopic(scope, '<plug>/observationsx'))
    assert.ok(includesTopic(FULL_SCOPE, 'bridge/event'))
})

test('names steps the scenario does not have', () => {
    const scope = scopeFromEnv({ MATTER_HARNESS_STEPS: 'plug-on,plug-onn' })
    assert.deepEqual(unknownSteps(scope, ['plug-on']), ['plug-onn'])
})
