import { CurrencyDollarIcon } from "@heroicons/react/20/solid";

export default function ArtistPoints() {
    return (
        <div className="grid grid-cols-3 grid-flow-cols gap-10 my-10 max-w-6xl mx-auto">
            <div>
                <div className="verification-info-card">
                    <h1 className="font-bold">95/5 Revenue Split</h1>
                    <p>Blurb</p>
                </div>
                <div className="verification-info-card">
                    <h1 className="inline-block font-bold">Streamlined Workflow</h1>
                    <p>Built in Kanban, Client Messaging, and SOMETHING</p>
                </div>
                <div className="verification-info-card">
                    <h1 className="inline-block font-bold">Commission Queues (with a cap)</h1>
                    <p>Blurb</p>
                </div>
            </div>
            <div className="bg-charcoal col-span-2 p-10 rounded-3xl text-left text-lg">
                <p>Wow Super Cool</p>
            </div>
        </div>
    )
}