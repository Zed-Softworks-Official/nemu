import DefaultPageLayout from '../(default)/layout'
import { Timeline, TimelineEvent } from '@/components/ui/timeline'

const events = [
    {
        title: 'Initial Launch',
        occured: true
    },
    {
        title: 'Something Else',
        occured: true
    },
    {
        title: 'Donations',
        occured: false
    },
    {
        title: 'Embedded Tipping',
        occured: false
    },
    {
        title: 'Something',
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
                                side={i % 2 === 0 ? 'left' : 'right'}
                                event={event}
                                previousEvent={i != 0 ? events[i - 1] : undefined}
                                end={i === events.length}
                            />
                        ))}
                    </Timeline>
                </div>
            </div>
        </DefaultPageLayout>
    )
}
