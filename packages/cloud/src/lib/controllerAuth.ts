import jwks from './controller.jwks.json'

/** Issuer for cloud-minted controller session JWTs (customJwt provider). */
export const CONTROLLER_JWT_ISSUER = 'https://nemu.sh/controller'

/** Audience / applicationID for controller session JWTs. */
export const CONTROLLER_JWT_AUDIENCE = 'nemu-controller'

/** Session token lifetime in seconds (~1 hour). */
export const CONTROLLER_JWT_TTL_SECONDS = 60 * 60

export function isControllerIssuer(issuer: string): boolean {
    return issuer === CONTROLLER_JWT_ISSUER
}

/** Public JWKS for Convex customJwt validation (not secret). */
export function controllerJwks(): { keys: Array<{ kid?: string }> } {
    return jwks
}

function utf8ToBase64(value: string): string {
    // auth.config evaluates without Node Buffer; prefer btoa when available.
    if (typeof btoa === 'function') {
        return btoa(value)
    }
    // Node / Convex actions
    return Buffer.from(value).toString('base64')
}

/**
 * Embed JWKS as a data URI so Convex does not fetch on every validation.
 */
export function controllerJwksDataUri(): string {
    return `data:text/plain;charset=utf-8;base64,${utf8ToBase64(
        JSON.stringify(jwks)
    )}`
}

export function controllerJwtKid(): string | undefined {
    return jwks.keys[0]?.kid
}
