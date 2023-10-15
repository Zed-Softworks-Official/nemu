import { create } from 'zustand'

export enum SocialIcon {
    Twitter, Email, ArtistCode
}

export enum MethodEnum {
    Twitter, Email, ArtistCode
}

export interface VerificationMethod {
    name: string
    icon: SocialIcon,
    method: MethodEnum
}

type VerificationFormStore = {
    requestedHandle: string
    setRequestedHandle: (value: string) => void

    twitter: string
    setTwitter: (value: string) => void

    pixiv: string
    setPixiv: (value: string) => void

    location: string
    setLocation: (value: string) => void

    verificationMethod: VerificationMethod
    setVerificationMethod: (value: VerificationMethod) => void

    artistCode?: string | undefined
    setArtistCode: (value: string) => void
}

const useVerificationFormStore = create<VerificationFormStore>((set) => ({
    requestedHandle: '',
    setRequestedHandle: (value) => set({ requestedHandle: value}),

    twitter: '',
    setTwitter: ((value) => set({twitter: value})),

    pixiv: '',
    setPixiv: ((value) => set({pixiv: value})),

    location: '',
    setLocation: ((value) => set({location: value})),

    verificationMethod: {name: 'X (Twitter)', icon: SocialIcon.Twitter, method: MethodEnum.Twitter},
    setVerificationMethod: ((value) => set({verificationMethod: value})),

    setArtistCode: ((value) => set({artistCode: value}))
}))

export default useVerificationFormStore