
export async function ArtistCodeVerification(code: string) {
    let response = await fetch(`/api/artist/code/${code}`, {
        method: 'post'
    });
    
    let validCode = (await response.json()).success;
    if (!validCode) return false;


} 