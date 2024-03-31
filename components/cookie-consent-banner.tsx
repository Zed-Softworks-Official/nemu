'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { hasCookie, setCookie } from 'cookies-next'

export default function CookieConsentBanner() {
    const [showConsent, setShowConsent] = useState(false)

    useEffect(() => {
        setShowConsent(!hasCookie('nemu-cookie-consent'))
    }, [])

    function AcceptCookies() {
        setShowConsent(false)
        setCookie('nemu-cookie-consent', true)
    }

    return (
        <dialog id="consent-dialog" className="modal modal-bottom" open={showConsent}>
            <div className="fixed inset-0 bg-[#0006]"></div>
            <div className="modal-box bg-base-300">
                <h2 className="font-bold text-lg">Cookies Consent Policy</h2>
                <div className="divider"></div>
                <div className="flex w-full gap-5 justify-between">
                    <div>
                        <p>
                            Nemu uses cookies to improve user experience. You can check out our{' '}
                            <Link href={'/'} className="font-bold underline">
                                Privacy Policy
                            </Link>{' '}
                            to see what we use them for.
                        </p>
                    </div>
                    <div className="modal-actions">
                        <form method="dialog" className="modal-backdrop bg-[#0006]">
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    AcceptCookies()
                                }}
                            >
                                Accept
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </dialog>
    )
}
