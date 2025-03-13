import { Plus } from 'lucide-react'
import Link from 'next/link'

import { ConTable } from './table'
import { Button } from '~/app/_components/ui/button'

export default function ConListPage() {
    return (
        <div className="container mx-auto flex flex-1 flex-col gap-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Conventions</h1>
                <Button asChild>
                    <Link href="/admin/con/create">
                        <Plus className="h-4 w-4" />
                        Add Convention
                    </Link>
                </Button>
            </div>

            <ConTable />
        </div>
    )
}
