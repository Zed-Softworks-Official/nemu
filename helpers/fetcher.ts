/**
 * General Fetcher for use with SWR library
 * 
 * @param args - Takes in a variable amount of parameters from the fetch function
 * @returns JSON data for the requested data
 */
export const fetcher = (...args: Parameters<typeof fetch>) => fetch(...args).then((res) => res.json())

/**
 * Gets the item id from a pathname
 * 
 * @param pathname - The pathname to find the item id from
 * @returns 
 */
export const get_item_id = (pathname: string) => {
    let lastSlash = pathname.lastIndexOf('/')
    return pathname.substring(lastSlash + 1, pathname.length + 1)
}