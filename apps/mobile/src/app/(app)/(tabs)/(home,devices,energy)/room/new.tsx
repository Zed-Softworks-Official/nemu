import { View } from 'react-native'

import { CreateRoomSheet } from '~/components/room-sheet'
import { useCloseSheet } from '~/components/use-close-sheet'

/** The create-Room sheet, presented natively by the tab Stack's layout. */
export default function CreateRoomSheetRoute() {
    const close = useCloseSheet()
    return (
        <View className="flex-1 bg-background">
            <CreateRoomSheet onClose={close} />
        </View>
    )
}
