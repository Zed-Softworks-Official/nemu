'use client'

import { toast } from 'react-toastify';

export default function ClientTestComponent() {
    const notify = () => toast("Oh Boy!", {
        type: 'success'
    });

    return (
        <div>
            <button onClick={notify}>Test Notification</button>
        </div>
    )
}