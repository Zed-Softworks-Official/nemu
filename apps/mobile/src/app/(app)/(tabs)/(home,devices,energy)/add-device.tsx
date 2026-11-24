import { View } from 'react-native'

import { AddDeviceSheet } from '~/components/add-device'
import { CameraCodeScanner } from '~/components/camera-code-scanner'
import { useCloseSheet } from '~/components/use-close-sheet'

/** The add-Device sheet, presented natively by the tab Stack's layout. */
export default function AddDeviceSheetRoute() {
    const close = useCloseSheet()
    return (
        <View className="flex-1 bg-background">
            <AddDeviceSheet onClose={close} Scanner={CameraCodeScanner} />
        </View>
    )
}
