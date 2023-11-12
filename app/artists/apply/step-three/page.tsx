import VertificationStep from '@/components/ArtistVerification/layout/verification-step'
import VerificationConfirmation from '@/components/ArtistVerification/steps/verification-confirm'

export default function VerificationStepThree() {
    return (
        <VertificationStep back="/artists/apply/step-two" next="" end>
            <VerificationConfirmation />
        </VertificationStep>
    )
}
