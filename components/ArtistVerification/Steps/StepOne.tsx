
export default function VerificationStepOne() {
    return (
        <div className="w-full">
            <div className="mb-10">
                <label htmlFor="requested_handle" className="block mb-5">Artist Handle</label>
                <input type="text" name="requested_handle" placeholder="Artist Handle" className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" required />
            </div>
            <div className="mb-10">
                <label htmlFor="twitter" className="block mb-5">Twitter (x)</label>
                <input type="text" name="twitter" placeholder="Twitter" className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" />
            </div>
            <div className="mb-10">
                <label htmlFor="pixiv" className="block mb-5">Pixiv</label>
                <input type="text" name="pixiv" placeholder="Pixiv" className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" />
            </div>
            <div className="mb-10">
                <label htmlFor="location" className="block mb-5">Pixiv</label>
                <input type="text" name="location" placeholder="Location" className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" />
            </div>
        </div>
    )
}