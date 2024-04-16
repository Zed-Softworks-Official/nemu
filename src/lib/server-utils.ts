import {getPlaiceholder} from 'plaiceholder'

export async function get_blur_data(src: string) {
    const buffer = await fetch(src).then(async (res) =>
        Buffer.from(await res.arrayBuffer())
    )
    const data = await getPlaiceholder(buffer)

    return data
}