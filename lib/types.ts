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
    url?: string,
    alias?: string
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
    deps?: string[],
    devDeps?: string[],
    homepage?: string,
    keywords?: string[],
    license?: string,
    lastFetched?: number,
    dependentCount?: number, // record how many dependents it has dependencies (both this one and the one below only track latest version)
    devDependentCount?: number, // record how many dependents it has as devDependencies
}

// date - number
export interface PackageStat {
    [key: string]: number
}

export enum FetchStatus {
    Ready,
    InfoFetching,
    InfoFetched,
    InfoFetchFailed,
    InfoFetchOver,
    Pending,
    Failed,
    Done,
    Over
}

export interface FetchHistory {
    packages: {
        [key: string]: FetchStatus
    },
    count: number,
    total: number
}


export interface PKG_NOT_FOUND {
    name: string,
    lastFetchedDate: number,
    fetchedCount: number,
    type: "info" | "stat",
}


export interface Listener {
    (...args): void;
}

export interface EndEventRest {
    finish?: boolean;  // true if finish this day's fetch job
    continue?: boolean;  // true if finish this round but not all
    msg?: string;
    seeds?: string[];
    error?: Error;
}