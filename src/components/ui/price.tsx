export default function Price(props: { value: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-muted-foreground/60 text-sm uppercase">From</span>
            <span className="text-2xl font-bold">{props.value}</span>
        </div>
    )
}
