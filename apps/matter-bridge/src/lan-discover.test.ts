import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    commissionCandidateIps,
    ipsForMacs,
    ipv4Addresses,
    ipv4OnSubnet,
    macsFromText,
    parseDefaultRoute,
    parseIpv4Addr,
    parseNeigh,
} from './lan-discover'

describe('parseDefaultRoute', () => {
    it('reads the default-route NIC and src', () => {
        const parsed = parseDefaultRoute(
            'default via 10.0.0.1 dev wlan0 proto dhcp src 10.0.0.88 metric 600\n'
        )
        assert.deepEqual(parsed, {
            dev: 'wlan0',
            src: '10.0.0.88',
            via: '10.0.0.1',
        })
    })
})

describe('parseIpv4Addr', () => {
    it('reads inet CIDR', () => {
        assert.deepEqual(
            parseIpv4Addr(
                '3: wlan0: <BROADCAST>\n    inet 10.0.0.88/24 brd 10.0.0.255 scope global\n'
            ),
            { ip: '10.0.0.88', prefix: 24 }
        )
    })
})

describe('parseNeigh', () => {
    it('keeps reachable IPv4 neighbors and drops FAILED', () => {
        const neighbors = parseNeigh(
            [
                '10.0.0.1 dev wlan0 lladdr 80:da:c2:7a:e2:37 REACHABLE',
                '10.0.0.76 dev wlan0 lladdr 58:d8:12:14:1b:cf STALE',
                '10.0.0.99 dev wlan0 FAILED',
                'fe80::1 dev wlan0 lladdr 80:da:c2:7a:e2:37 REACHABLE',
            ].join('\n')
        )
        assert.deepEqual(
            neighbors.map((item) => ({
                ip: item.ip,
                live: item.live,
            })),
            [
                { ip: '10.0.0.1', live: true },
                { ip: '10.0.0.76', live: false },
            ]
        )
        assert.equal(neighbors[1]?.mac, '58:d8:12:14:1b:cf')
    })
})

describe('ipv4OnSubnet', () => {
    it('matches the controller /24 and rejects other RFC1918 nets', () => {
        assert.equal(ipv4OnSubnet('10.0.0.76', '10.0.0.88', 24), true)
        assert.equal(ipv4OnSubnet('192.168.1.80', '10.0.0.88', 24), false)
        assert.equal(ipv4OnSubnet('10.0.1.4', '10.0.0.88', 24), false)
    })
})

describe('commissionCandidateIps', () => {
    const host = {
        ip: '10.0.0.88',
        prefix: 24,
        dev: 'wlan0',
        via: '10.0.0.1',
    }

    it('prefers new neighbors and skips the gateway', () => {
        assert.deepEqual(
            commissionCandidateIps(
                ['10.0.0.76', '10.0.0.1'],
                ['10.0.0.1', '10.0.0.76', '10.0.0.12'],
                host
            ),
            ['10.0.0.76']
        )
    })

    it('falls back to on-subnet neighbors when nothing new appeared', () => {
        assert.deepEqual(
            commissionCandidateIps(
                [],
                ['10.0.0.1', '10.0.0.76', '192.168.1.80'],
                host
            ),
            ['10.0.0.76']
        )
    })
})

describe('ipv4Addresses', () => {
    it('keeps IPv4 and drops link-local IPv6', () => {
        assert.deepEqual(
            ipv4Addresses([
                '10.0.0.76',
                'fe80::5ad8:12ff:fe14:1bcf%wlan0',
                '10.0.0.76',
            ]),
            ['10.0.0.76']
        )
    })
})

describe('macsFromText', () => {
    it('extracts a BLE peripheral MAC', () => {
        assert.deepEqual(
            macsFromText(
                'Can not connect to peripheral "58:D8:12:14:1B:CF" because unexpected state "error"'
            ),
            ['58:d8:12:14:1b:cf']
        )
    })
})

describe('ipsForMacs', () => {
    it('returns the live IPv4 for a matching MAC and ignores other hosts', () => {
        assert.deepEqual(
            ipsForMacs(
                [
                    {
                        ip: '10.0.0.22',
                        mac: 'e4:5f:01:5d:29:63',
                        dev: 'wlan0',
                        state: 'REACHABLE',
                        live: true,
                    },
                    {
                        ip: '10.0.0.76',
                        mac: '58:d8:12:14:1b:cf',
                        dev: 'wlan0',
                        state: 'REACHABLE',
                        live: true,
                    },
                ],
                ['58:D8:12:14:1B:CF']
            ),
            ['10.0.0.76']
        )
    })
})
