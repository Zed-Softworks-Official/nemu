import { useEffect } from 'react'

import { toPusherKey } from '~/lib/utils'
import { pusherClient } from '~/server/pusher/client'

type PusherOpts<T> = {
    key: string
    event_name: 'message'
    callback: (data: T) => void
}

export function usePusher<T>(opts: PusherOpts<T>) {
    useEffect(() => {
        pusherClient.subscribe(toPusherKey(opts.key))
        pusherClient.bind(opts.event_name, opts.callback)

        return () => {
            pusherClient.unsubscribe(toPusherKey(opts.key))
            pusherClient.unbind(opts.event_name, opts.callback)
        }
    }, [opts])
}
