'use client'

import useVerificationFormStore from "@/store/VerificationForm"

export default function VerificationInfo() {
    const { 
        requestedHandle, 
        setRequestedHandle,
        twitter,
        setTwitter,
        pixiv,
        setPixiv,
        location,
        setLocation
     } = useVerificationFormStore()

    return (
        <div className="w-full">
            <div className="mb-10">
                <label 
                    className="block mb-5"
                    htmlFor="requested_handle"
                >
                    Artist Handle
                </label>

                <input 
                    type="text"
                    name="requested_handle"
                    placeholder={requestedHandle} 
                    className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" 
                    onChange={(e) => setRequestedHandle(e.target.value)} 
                />
            </div>

            <div className="mb-10">
                <label 
                    htmlFor="twitter"
                    className="block mb-5"
                >
                    Twitter URL
                </label>

                <input 
                    type="text"
                    name="twitter"
                    placeholder={twitter} 
                    className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" 
                    onChange={(e) => setTwitter(e.target.value)} 
                />
            </div>

            <div className="mb-10">
                <label 
                    className="block mb-5"
                    htmlFor="pixiv"
                >
                    Pixiv URL
                </label>

                <input 
                    type="text"
                    name="pixiv"
                    placeholder={pixiv} 
                    className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" 
                    onChange={(e) => setPixiv(e.target.value)} 
                />
            </div>

            <div className="mb-10">
                <label 
                    className="block mb-5"
                    htmlFor="location"
                >
                    Location
                </label>

                <input 
                    type="text"
                    name="location"
                    placeholder={location} 
                    className="bg-white dark:bg-charcoal p-5 rounded-xl w-full" 
                    onChange={(e) => setLocation(e.target.value)} 
                />
            </div>
        </div>
    )
}