import { getPlaiceholder} from 'plaiceholder'

/**
 * Creates a blur_data placeholder for the given image
 *
 * @param {string} src - The source url
 * @returns The blur_data from the image in base64
 */
export async function get_blur_data(src: string) {
    const buffer = await fetch(src).then(async (res) =>
        Buffer.from(await res.arrayBuffer())
    )
    const data = await getPlaiceholder(buffer)

    return data.base64
}
