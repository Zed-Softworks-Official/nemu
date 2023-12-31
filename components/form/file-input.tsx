export default function FileInput({
    label,
    name,
    multiple,
    max_length
}: {
    label: string
    name: string,
    multiple?: boolean
    max_length?: number
}) {
    return (
        <div className="mb-5">
            <label htmlFor={name} className="block mb-5">
                {label}:
            </label>
            <input
                type="file"
                name={name}
                title={name}
                multiple={multiple}
                maxLength={max_length ? max_length : 1}
                className="file-input file-input-primary border-0 w-full"
            />
        </div>
    )
}
