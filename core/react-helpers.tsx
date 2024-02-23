import { CommissionAvailability } from './structures'

/**
 *
 * @param {CommissionAvailability} availability
 * @returns {React.ReactNode}
 */
export function ConvertAvailabilityToBadge(
    availability: CommissionAvailability
): React.ReactNode {
    switch (availability) {
        case CommissionAvailability.Closed:
            return <span className="badge badge-error badge-lg">Closed</span>
        case CommissionAvailability.Waitlist:
            return <span className="badge badge-warning badge-lg">Waitlist</span>
        case CommissionAvailability.Open:
            return <span className="badge badge-success badge-lg">Open</span>
    }
}

/**
 * 
 * @param published 
 * @returns 
 */
export function ConvertPublishedToBadge(published: boolean): React.ReactNode {
    if (published) {
        return <span className="badge badge-primary badge-lg">Published</span>
    } else {
        return <span className="badge badge-error badge-lg">Unpublished</span>
    }
}
