import VertificationStep from "@/components/ArtistVerification/Layout/VerificationStep";
import VerificationConfirmation from "@/components/ArtistVerification/Steps/VerificationConfirm";

export default function VerificationStepThree() {
    return (
        <VertificationStep back="/artists/apply/step-two" next=""  end >
            <VerificationConfirmation />
        </VertificationStep>
    )
}