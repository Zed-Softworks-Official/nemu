import { View } from 'react-native'

import { MembershipRoleProvider } from '~/components/membership-role'
import { UpdateSheet } from '~/components/update-sheet'
import { useCloseSheet } from '~/components/use-close-sheet'

/** The update confirmation sheet, presented by the tab Stack's layout. */
export default function UpdateSheetRoute() {
    const close = useCloseSheet()
    return (
        <MembershipRoleProvider>
            <View className="flex-1 bg-background">
                <UpdateSheet onClose={close} />
            </View>
        </MembershipRoleProvider>
    )
}
