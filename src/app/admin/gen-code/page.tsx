import { GenerateAristCode, CurrentArtistCodes } from './generate'

export default function GenerateCodePage() {
    return (
        <div className="container mx-auto flex flex-col">
            <GenerateAristCode />
            <CurrentArtistCodes />
        </div>
    )
}
