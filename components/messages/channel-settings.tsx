'use client'

import ChannelSettingsUI from '@sendbird/uikit-react/ChannelSettings/components/ChannelSettingsUI'
import { ChannelSettingsProvider, useChannelSettingsContext } from '@sendbird/uikit-react/ChannelSettings/context'

function CustomSettings() {
    const { channel } = useChannelSettingsContext()

    return <ChannelSettingsUI />
}

export default function ChannelSettings({ channel_url }: { channel_url: string }) {
    return (
        <ChannelSettingsProvider channelUrl={channel_url}>
            <CustomSettings />
        </ChannelSettingsProvider>
    )
}
