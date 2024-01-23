import { CommissionAvailability } from "./structures"

/**
 * 
 * @param {CommissionAvailability} availability 
 * @returns {React.ReactNode}
 */
export function ConvertAvailabilityToBadge(availability: CommissionAvailability): React.ReactNode {
    switch (availability) {
        case CommissionAvailability.Closed:
            return (<div className="badge badge-error badge-lg">Closed</div>)
        case CommissionAvailability.Waitlist:
            return <div className="badge badge-warning badge-lg">Waitlist</div>
        case CommissionAvailability.Open:
            return <div className="badge badge-success badge-lg">Open</div>
    }
}