import VerificationOption from "@/components/ArtistVerification/Steps/VerificationOption";
import VertificationStep from "@/components/ArtistVerification/Layout/VerificationStep";

export default function VerificationStepTwo() {
    return (
        <VertificationStep back="/artists/apply/step-one" next="/artists/apply/step-three" >
            <VerificationOption />
        </VertificationStep>
    )
}