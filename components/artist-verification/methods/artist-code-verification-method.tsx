'use client'

import useVerificationFormStore from "@/store/VerificationForm"

export default function ArtistCodeVerificiationMethod() {
    const { artistCode, setArtistCode } = useVerificationFormStore();

    return (
        <div className="pb-10">
            <h1>What Next?</h1>
            <p>Please put your artist code that you have in the text field below and press submit. You&apos;ll recieve an email to your associated account with your verification status and a link to your onboarding page.</p>

            <div className="mt-10">
                <label 
                    className="block mb-5"
                    htmlFor="Artist Code"
                >
                    Artist Code 
                </label>

                <input 
                    type="text"
                    name="artistCode"
                    placeholder={"Artist Code"} 
                    className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" 
                    onChange={(e) => setArtistCode(e.target.value)}
                    required 
                />
            </div>
        </div>
    )
}