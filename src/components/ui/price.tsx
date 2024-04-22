export default function Price({ value }: { value: string }) {
    return (
        <div className="flex flex-col">
            <span className="uppercase text-sm text-base-content/60">From</span>
            <span className="text-2xl font-bold">{value}</span>
        </div>
    )
}
