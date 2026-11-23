/**
 * Portable asset module shape.
 * - Expo/Metro: numeric asset registry id
 * - Next.js: StaticImageData-compatible object
 */
type NemuAssetModule =
    | number
    | {
          src: string
          height: number
          width: number
          blurDataURL?: string
      }

declare module '*.png' {
    const content: NemuAssetModule
    export default content
}

declare module '*.ico' {
    const content: NemuAssetModule
    export default content
}

declare module '*.svg' {
    const content: NemuAssetModule
    export default content
}
