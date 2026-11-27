/**
 * Which part of the scenario a run checks. An adapter that is still being
 * built (the matter.js adapter, ticket by ticket) runs only the steps it
 * supports and leaves out topics a later ticket adds. The golden file is
 * filtered the same way, so the comparison stays exact for what is in scope.
 *
 *   MATTER_HARNESS_STEPS          comma-separated step names (default: all)
 *   MATTER_HARNESS_IGNORE_TOPICS  comma-separated topics or topic leaves left
 *                                 out of the comparison, for example
 *                                 `capabilities,observations`
 *
 * Recording (`--record`) always runs the whole scenario.
 */

export interface Scope {
    /** Step names to run, or undefined for every step. */
    steps?: ReadonlySet<string>
    /** A topic is left out when it equals one of these or ends in `/<entry>`. */
    ignoredTopics: readonly string[]
}

export const FULL_SCOPE: Scope = { ignoredTopics: [] }

type Env = Readonly<Record<string, string | undefined>>

function list(raw: string | undefined): string[] {
    return (raw ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
}

export function scopeFromEnv(env: Env): Scope {
    const steps = list(env.MATTER_HARNESS_STEPS)
    const scope: Scope = {
        ignoredTopics: list(env.MATTER_HARNESS_IGNORE_TOPICS),
    }
    return steps.length > 0 ? { ...scope, steps: new Set(steps) } : scope
}

export function isFullScope(scope: Scope): boolean {
    return scope.steps === undefined && scope.ignoredTopics.length === 0
}

export function includesStep(scope: Scope, step: string): boolean {
    return scope.steps === undefined || scope.steps.has(step)
}

export function includesTopic(scope: Scope, topic: string): boolean {
    return !scope.ignoredTopics.some(
        (entry) => topic === entry || topic.endsWith(`/${entry}`)
    )
}

export interface ScopedStep {
    step: string
    messages: Record<string, unknown[]>
}

/** The steps and topics of a normalised run (or golden file) that are in scope. */
export function applyScope<T extends ScopedStep>(
    steps: readonly T[],
    scope: Scope
): T[] {
    return steps
        .filter((step) => includesStep(scope, step.step))
        .map((step) => ({
            ...step,
            messages: Object.fromEntries(
                Object.entries(step.messages).filter(([topic]) =>
                    includesTopic(scope, topic)
                )
            ),
        }))
}

/** Names in the scope that the scenario does not have, so a typo fails loudly. */
export function unknownSteps(scope: Scope, known: readonly string[]): string[] {
    return [...(scope.steps ?? [])].filter((step) => !known.includes(step))
}
