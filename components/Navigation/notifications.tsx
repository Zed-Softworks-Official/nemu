import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
import { INotificationCenterStyles } from '@novu/notification-center'
import NotificationPopover from './notification-popover'

export default async function Notifications() {
    const session = await getServerAuthSession()

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

    if (!session) {
        return <></>
    }

    return <NotificationPopover session={session} styles={styles} />
}
