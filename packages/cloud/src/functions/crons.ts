import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
    'cleanup relay messages',
    { minutes: 1 },
    internal.relay.cleanup,
    {}
)

crons.interval(
    'renew LAN TLS certificates',
    { hours: 24 },
    internal.acmeActions.renewExpiring,
    {}
)

export default crons
