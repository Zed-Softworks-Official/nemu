import { Card, CardContent } from '@nemu/ui/components/card'
import type { LucideIcon } from 'lucide-react'

type StatCardProps = {
    label: string
    value: string
    detail: string
    icon: LucideIcon
}

export function StatCard({ label, value, detail, icon: Icon }: StatCardProps) {
    return (
        <Card size="sm">
            <CardContent className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-1 font-heading font-semibold text-2xl tracking-tight">
                        {value}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                        {detail}
                    </p>
                </div>
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                </div>
            </CardContent>
        </Card>
    )
}
