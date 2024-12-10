import { useEffect } from 'react'

import { to_pusher_key } from '~/lib/utils'
import { pusher_client } from '~/server/pusher/client'

type PusherOpts = {
    key: string
    event_name: 'message'
    callback: (data: unknown) => void
}

export function usePusher(opts: PusherOpts) {
    useEffect(() => {
        pusher_client.subscribe(to_pusher_key(opts.key))
        pusher_client.bind(opts.event_name, opts.callback)

        return () => {
            pusher_client.unsubscribe(to_pusher_key(opts.key))
            pusher_client.unbind(opts.event_name, opts.callback)
        }
    }, [opts])
}
