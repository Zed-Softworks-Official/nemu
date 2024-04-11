import DefaultPageLayout from '../(default)/layout'
import { Timeline, TimelineEvent, TimelineEventType } from '@/components/ui/timeline'

const events: TimelineEventType[] = [
    {
        title: 'Initial Launch',
        occured: true
    },
    {
        title: 'Embedded Tipping',
        occured: false
    },
    {
        title: 'Donations',
        occured: false
    },
    {
        title: 'Add commissions to portfolio',
        occured: false
    },
    {
        title: 'Something',
        occured: false
    },
    {
        title: 'Something',
        occured: false
    }
]

export default function Roadmap() {
    return (
        <DefaultPageLayout>
            <div className="card bg-base-300 shadow-xl">
                <div className="card-body flex-row">
                    <Timeline>
                        {events.map((event, i) => (
                            <TimelineEvent
                                side={'right'}
                                event={event}
                                previousEvent={i != 0 ? events[i - 1] : undefined}
                                nextEvent={
                                    i != events.length - 1 ? events[i + 1] : undefined
                                }
                                end={i === events.length - 1}
                            />
                        ))}
                    </Timeline>
                </div>
            </div>
        </DefaultPageLayout>
    )
}
