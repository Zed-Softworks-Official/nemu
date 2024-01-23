'use client'

import useVerificationFormStore from '@/store/VerificationForm'
import { useSession } from 'next-auth/react'

// TODO: Debounce input field and also do a quick data search to make sure the requeted params for (requested_handle) don't already exist in the users table

export default function VerificationInfo() {
    const { 
        setRequestedHandle,
        setTwitter,
        setPixiv,
        setLocation
    } = useVerificationFormStore()

    const { data: session } = useSession()
    let twitterDefaultValue = session?.user.provider == 'twitter' ? `https://x.com/${session.user.name}` : ''

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
                    placeholder="Handle" 
                    className="input w-full" 
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
                    placeholder="Twitter URL"
                    className="input w-full" 
                    onChange={(e) => setTwitter(e.target.value)} 
                    defaultValue={twitterDefaultValue}
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
                    placeholder="Pixiv URL (optional)"
                    className="input w-full" 
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
                    placeholder="location (optional)" 
                    className="input w-full" 
                    onChange={(e) => setLocation(e.target.value)} 
                />
            </div>
        </div>
    )
}