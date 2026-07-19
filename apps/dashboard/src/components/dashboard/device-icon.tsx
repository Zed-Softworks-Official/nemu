import {
    LightbulbIcon,
    RadioIcon,
    ThermometerIcon,
    UnplugIcon,
} from 'lucide-react'
import type { DashboardDevice } from '~/lib/dashboard-data'

export function DeviceIcon({
    category,
    className = 'size-5',
}: {
    category: DashboardDevice['category']
    className?: string
}) {
    if (category === 'light') {
        return <LightbulbIcon className={className} />
    }

    if (category === 'climate') {
        return <ThermometerIcon className={className} />
    }

    if (category === 'outlet') {
        return <UnplugIcon className={className} />
    }

    return <RadioIcon className={className} />
}
