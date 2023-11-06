export default function TextInput({
    name,
    label,
    placeholder,
    type = 'text'
}: {
    name: string
    label: string,
    placeholder?: string
    type?: string
}) {
    return (
        <div className="mb-5">
            <label htmlFor={name} className="block mb-5">
                {label}:
            </label>
            <input
                name={name}
                placeholder={placeholder ? placeholder : label}
                type={type}
                className="bg-white dark:bg-charcoal p-5 rounded-xl w-full"
            />
        </div>
    )
}
