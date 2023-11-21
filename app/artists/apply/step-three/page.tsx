import VertificationStep from '@/components/artist-verification/layout/verification-step'
import VerificationConfirmation from '@/components/artist-verification/steps/verification-confirm'

export default function VerificationStepThree() {
    return (
        <VertificationStep back="/artists/apply/step-two" next="" end>
            <VerificationConfirmation />
        </VertificationStep>
    )
}
