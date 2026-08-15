'use node'

import { X509Certificate } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import acme from 'acme-client'
import { v } from 'convex/values'
import {
    deleteRecordsByName,
    upsertRecord,
    vercelConfigured,
} from '../lib/lanDns'
import { lanHostnameFor, vercelRecordName } from '../lib/lanHostname'
import { internal } from './_generated/api'
import { type ActionCtx, internalAction } from './_generated/server'

const STAGING_DIRECTORY =
    'https://acme-staging-v02.api.letsencrypt.org/directory'
const RENEW_WITHIN_MS = 30 * 24 * 60 * 60 * 1000

function directoryUrl(): string {
    return process.env.ACME_DIRECTORY_URL ?? STAGING_DIRECTORY
}

function zone(): string {
    return process.env.NEMU_LAN_ZONE ?? 'nemu.sh'
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function waitForTxt(fqdn: string, value: string): Promise<void> {
    const resolver = new Resolver()
    resolver.setServers(['8.8.8.8', '1.1.1.1'])
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            const records = await resolver.resolveTxt(fqdn)
            const flat = records.flat().join('')
            if (flat.includes(value)) return
        } catch {
            // NXDOMAIN / SERVFAIL until the TXT is published
        }
        await sleep(2000)
    }
    throw new Error(`ACME TXT for ${fqdn} did not become publicly visible`)
}

async function loadAccountKey(ctx: ActionCtx): Promise<Buffer> {
    const url = directoryUrl()
    const existing = await ctx.runQuery(internal.controllers.getAcmeAccount, {
        directoryUrl: url,
    })
    if (existing) {
        return Buffer.from(existing)
    }
    const created = await acme.crypto.createPrivateKey()
    const pem = created.toString()
    await ctx.runMutation(internal.controllers.upsertAcmeAccount, {
        directoryUrl: url,
        accountKeyPem: pem,
    })
    return Buffer.from(pem)
}

export const issueForController = internalAction({
    args: { controllerId: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
        if (!vercelConfigured()) {
            console.warn('Skipping LAN cert issue: VERCEL_TOKEN is not set')
            return null
        }

        const controller = await ctx.runQuery(
            internal.controllers.getForIssue,
            {
                controllerId: args.controllerId,
            }
        )
        if (!controller?.lanIp) {
            return null
        }

        const hostname = lanHostnameFor(controller.controllerId)
        const recordName = vercelRecordName(hostname, zone())
        await upsertRecord(recordName, 'A', controller.lanIp)

        const now = Date.now()
        if (
            controller.tlsCertPem &&
            controller.tlsExpiresAt !== undefined &&
            controller.tlsExpiresAt > now + RENEW_WITHIN_MS
        ) {
            return null
        }

        const accountKey = await loadAccountKey(ctx)
        const client = new acme.Client({
            directoryUrl: directoryUrl(),
            accountKey,
        })

        const contact = process.env.ACME_CONTACT_EMAIL
        await client.createAccount({
            termsOfServiceAgreed: true,
            ...(contact ? { contact: [`mailto:${contact}`] } : {}),
        })

        const [privateKey, csr] = await acme.crypto.createCsr({
            commonName: hostname,
        })

        const challengeName = `_acme-challenge.${recordName}`
        const challengeFqdn = `_acme-challenge.${hostname}`

        const certPem = await client.auto({
            csr,
            challengePriority: ['dns-01'],
            skipChallengeVerification: true,
            challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
                if (challenge.type !== 'dns-01') return
                await upsertRecord(challengeName, 'TXT', keyAuthorization)
                await waitForTxt(challengeFqdn, keyAuthorization)
            },
            challengeRemoveFn: async (_authz, challenge) => {
                if (challenge.type !== 'dns-01') return
                await deleteRecordsByName(challengeName, 'TXT')
            },
        })

        const parsed = new X509Certificate(certPem)
        const expiresAt = Date.parse(parsed.validTo)
        if (Number.isNaN(expiresAt)) {
            throw new Error('Issued certificate has an unreadable expiry')
        }

        await ctx.runMutation(internal.controllers.saveTlsMaterial, {
            controllerId: args.controllerId,
            certPem,
            keyPem: privateKey.toString(),
            expiresAt,
            lanHostname: hostname,
        })
        return null
    },
})

export const renewExpiring = internalAction({
    args: {},
    returns: v.null(),
    handler: async (ctx) => {
        const ids = await ctx.runQuery(
            internal.controllers.listNeedingRenewal,
            {
                now: Date.now(),
                withinMs: RENEW_WITHIN_MS,
            }
        )
        for (const controllerId of ids) {
            await ctx.runAction(internal.acmeActions.issueForController, {
                controllerId,
            })
        }
        return null
    },
})
