#!/usr/bin/env node
/**
 * Generate an ES256 keypair + JWKS for controller session JWTs.
 *
 * - Writes public JWKS to packages/cloud/src/lib/controller.jwks.json (commit this)
 * - Prints CONTROLLER_JWT_PRIVATE_KEY to set on the Convex deployment (do not commit)
 *
 * Usage (from repo root or packages/cloud):
 *   node scripts/generate-controller-jwt.mjs
 *   pnpm --filter @nemu/cloud exec node ../../scripts/generate-controller-jwt.mjs
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cloudDir = join(root, 'packages/cloud')
const jwksPath = join(cloudDir, 'src/lib/controller.jwks.json')

const require = createRequire(join(cloudDir, 'package.json'))
const { exportJWK, exportPKCS8, generateKeyPair } = await import(
    pathToFileURL(require.resolve('jose')).href
)

const kid = `nemu-controller-${randomBytes(4).toString('hex')}`

const { privateKey, publicKey } = await generateKeyPair('ES256', {
    extractable: true,
})

const privatePem = await exportPKCS8(privateKey)
const jwk = await exportJWK(publicKey)
jwk.kid = kid
jwk.use = 'sig'
jwk.alg = 'ES256'

const jwks = { keys: [jwk] }
writeFileSync(jwksPath, `${JSON.stringify(jwks, null, 4)}\n`)

console.log(`Wrote public JWKS to ${jwksPath}`)
console.log('Commit that file, then set the private key on Convex (stdin avoids shell history):')
console.log('')
console.log('  # save the PEM from below to /tmp/controller.jwt.pem, then:')
console.log('  cd packages/cloud && cat /tmp/controller.jwt.pem | npx convex env set CONTROLLER_JWT_PRIVATE_KEY')
console.log('  # also: npx convex env set CONTROLLER_JWT_PRIVATE_KEY --prod < ...  for production')
console.log('')
console.log('Private key PEM:')
console.log(privatePem)
console.log('')
console.log(
    'Then push Convex (`npx convex dev` / deploy) so auth.config picks up the new JWKS.'
)
