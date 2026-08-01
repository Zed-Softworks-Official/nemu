import { Button } from '@nemu/ui/components/button'
import { PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { DevicesList } from '~/components/dashboard/devices-list'
import { PageHeader } from '~/components/dashboard/page-header'

export default function DevicesPage() {
    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
            <PageHeader
                actions={
                    <Button asChild>
                        <Link href="/devices/add">
                            <PlusIcon data-icon="inline-start" />
                            Add device
                        </Link>
                    </Button>
                }
                description="View status, organize rooms, and manage every device connected to Nemu."
                title="Devices"
            />

            <DevicesList />
        </div>
    )
}
