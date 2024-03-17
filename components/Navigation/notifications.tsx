'use client'

import { NovuProvider, PopoverNotificationCenter, NotificationBell, INotificationCenterStyles, IMessage } from '@novu/notification-center'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Notifications() {
    const { data: session } = useSession()
    const [subscriberId, setSubscriberId] = useState<string | undefined>(undefined)

    const { push } = useRouter()

    const styles: INotificationCenterStyles = {
        layout: {
            root: {
                background: '#282828'
            }
        },
        notifications: {
            root: {
                '.nc-notifications-list-item': {
                    background: '#333',
                    ':before': {
                        background: '#2185d5'
                    }
                }
            },
            listItem: {
                timestamp: {
                    color: '#f3f3f3'
                }
            }
        },
        unseenBadge: {
            root: {
                background: '#2185d5'
            }
        },
        bellButton: {
            dot: {
                rect: {
                    fill: '#2185d5'
                }
            }
        }
    }

    useEffect(() => {
        if (!session) return

        setSubscriberId(session.user.user_id)
    }, [session])

    if (!subscriberId) {
        return <></>
    }

    function HandleOnNotificationOnClick(message: IMessage) {
        if (message?.cta?.data?.url) {
            push(message.cta.data.url!)
        }
    }

    return (
        <NovuProvider subscriberId={subscriberId} applicationIdentifier="E99zFNlbi0Fe" styles={styles}>
            <PopoverNotificationCenter
                colorScheme="dark"
                showUserPreferences={false}
                onNotificationClick={HandleOnNotificationOnClick}
                footer={() => <></>}
            >
                {({ unseenCount }) => <NotificationBell unseenCount={unseenCount} unseenBadgeColor={'#2185d5'} />}
            </PopoverNotificationCenter>
        </NovuProvider>
    )
}
