export default function FileInput({
    label,
    name,
    multiple
}: {
    label: string
    name: string,
    multiple?: boolean
    
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
                className="bg-charcoal w-full p-5 rounded-xl file:bg-primary hover:file:bg-primarylight file:cursor-pointer dark:file:text-white file:text-charcoal file:-ml-5 file:-my-5 file:p-5 file:border-none file:rounded-l-xl file:mr-5"
            />
        </div>
    )
}
