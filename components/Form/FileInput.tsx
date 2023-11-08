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
                className="bg-charcoal w-full p-5 rounded-xl file:bg-primary hover:file:bg-primarylight file:cursor-pointer dark:file:text-white file:text-charcoal file:-ml-5 file:-my-5 file:p-5 file:border-none file:rounded-l-xl file:mr-5"
            />
        </div>
    )
}
