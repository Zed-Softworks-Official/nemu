export default function CommissionFormSubmissionContent({
    content
}: {
    content: string
}) {
    return (
        <>
            {Object.keys(JSON.parse(content)).map((key, i) => (
                <div key={i} className="card bg-base-300 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">{JSON.parse(content)[key].label}</h2>
                        <p>{JSON.parse(content)[key].value}</p>
                    </div>
                </div>
            ))}
        </>
    )
}
