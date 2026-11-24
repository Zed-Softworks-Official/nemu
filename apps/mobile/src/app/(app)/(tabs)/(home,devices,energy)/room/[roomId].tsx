import { useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'

import { RoomSheet } from '~/components/room-sheet'
import { useCloseSheet } from '~/components/use-close-sheet'

/** The Room sheet, presented natively by the tab Stack's layout. */
export default function RoomSheetRoute() {
    const { roomId } = useLocalSearchParams<{ roomId: string }>()
    const close = useCloseSheet()
    return (
        <View className="flex-1 bg-background">
            <RoomSheet onClose={close} roomId={roomId} />
        </View>
    )
}
