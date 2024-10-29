'use client'

import { useState } from 'react'

import type { ClientCommissionItem } from '~/core/structures'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '~/components/ui/table'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Eye } from 'lucide-react'
import Link from 'next/link'

export default function CommissionTable(props: { commissions: ClientCommissionItem[] }) {
    const [filteredCommissions, setFilteredCommissions] = useState<
        ClientCommissionItem[]
    >(props.commissions)

    return (
        <div className="mb-4 flex space-x-4">
            <Table className="w-full">
                <TableHeader>
                    <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total Requests</TableHead>
                        <TableHead>New Requests</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredCommissions.map((commission) => (
                        <TableRow key={commission.id}>
                            <TableCell className="font-medium">
                                {commission.title}
                            </TableCell>
                            <TableCell>
                                <Badge
                                    variant={
                                        commission.published ? 'default' : 'secondary'
                                    }
                                >
                                    {commission.published ? 'Published' : 'Unpublished'}
                                </Badge>
                            </TableCell>
                            <TableCell>12</TableCell>
                            <TableCell>
                                {8 > 0 && <Badge variant="destructive">8 New</Badge>}
                            </TableCell>
                            <TableCell>
                                <Link
                                    className="btn btn-outline text-base-content"
                                    href={`/dashboard/commissions/${commission.slug}`}
                                >
                                    <Eye className="h-6 w-6" />
                                    View
                                </Link>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
