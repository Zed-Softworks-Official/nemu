import NavigationButtons from "@/components/ArtistVerification/NavigationButtons";
import TextInput from "@/components/ArtistVerification/TextInput";
import VertificationStep from "@/components/ArtistVerification/VerificationStep";

export default function VerificationStepOne() {
    return (
        <VertificationStep back="" next="/artists/apply/step-two" home >
            <div className="w-full">
                <TextInput htmlDataName="requested_handle" labelText="Artist Handle"/>
                <TextInput htmlDataName="twitter" labelText="Twitter"/>
                <TextInput htmlDataName="pixiv" labelText="Pixiv"/>
                <TextInput htmlDataName="location" labelText="Location"/>
            </div>
        </VertificationStep>
    )
}