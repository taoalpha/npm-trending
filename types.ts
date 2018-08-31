export interface ServerPkgStatDownload {
    downloads: number,
    day: string
}

// interface of data from the server api
export interface ServerPkgStat {
    error?: any,
    start?: string,
    end?: string,
    package?: string,
    downloads?: ServerPkgStatDownload[]
}

// interface we store locally
// we separate information to two different dbs:
// 1. package info, including description, version histories, etc (https://registry.npmjs.org/xo)
// 2. package stats, including downloads (per day) (https://api.npmjs.org/downloads/range/last-year/xo)
export interface Maintainer {
    email?: string,
    name?: string,
    url?: string
}

export interface Repository {
    type?: string,
    url?: string
}

export interface PackageInfo {
    name: string,
    versions?: any[],
    maintainers?: Maintainer[],
    time?: any,  // each revision time and created / modified
    author?: Maintainer,
    repository?: Repository,
    description?: string,
    homepage?: string,
    keywords?: string[],
    license?: string,
    lastFetched?: number
}

// date - number
export interface PackageStat {
    [key: string]: number
}

export interface FetchHistory {
    packages: {
        [key: string]: 1 | 0 
    },
    count: number,
    total: number
}