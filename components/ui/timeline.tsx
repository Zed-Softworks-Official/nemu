import { cn } from '@/lib/utils'
import { CheckCircleIcon } from 'lucide-react'

export type TimelineEventType = {
    title: string
    occured: boolean
}

export function Timeline({ children }: { children: React.ReactNode }) {
    return <ul className="timeline timeline-vertical">{children}</ul>
}

export function TimelineEvent({
    event,
    side,
    previousEvent,
    nextEvent,
    end
}: {
    event: TimelineEventType
    side: 'left' | 'right'
    previousEvent?: TimelineEventType,
    nextEvent?: TimelineEventType
    end: boolean
}) {
    return (
        <li key={event.title}>
            {previousEvent && (
                <hr
                    className={cn(
                        previousEvent.occured && event.occured
                            ? 'bg-primary'
                            : 'bg-accent'
                    )}
                />
            )}
            <div
                className={cn(
                    'timeline-box',
                    side === 'left' ? 'timeline-start' : 'timeline-end'
                )}
            >
                {event.title}
            </div>
            <div className="timeline-middle">
                <CheckCircleIcon
                    className={cn(
                        'w-5 h-5',
                        event.occured ? 'text-primary' : 'text-accent'
                    )}
                />
            </div>

            {!end && <hr className={cn(nextEvent?.occured ? 'bg-primary' : 'bg-accent')} />}
        </li>
    )
}
