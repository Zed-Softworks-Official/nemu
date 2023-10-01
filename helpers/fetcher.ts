/**
 * General Fetcher for use with SWR library
 * 
 * @param args - Takes in a variable amount of parameters from the fetch function
 * @returns JSON data for the requested data
 */
export const fetcher = (...args: Parameters<typeof fetch>) => fetch(...args).then((res) => res.json())
