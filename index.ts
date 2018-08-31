/**
 * 
 * Update @ 2018/8/30
 * 
 * move to typescript and circleci.
 * 
 * Goal: use circleci to fetch / update / deploy continuously
 * Limit: free tier for circleci limits to 1 job <= 5min (which won't be enough to fetch all packages...)
 * Solution:
 *  - run same job multiple times and store all results
 *  - concatenate all results
 */

import * as Promise from 'bluebird';
import * as rp from "request-promise";
import { readJsonSync, ensureFileSync, writeJsonSync, readFileSync, writeFileSync, readdirSync, removeSync, pathExistsSync } from "fs-extra";
import { Once } from "lodash-decorators";
import { join as joinPath } from "path";

interface ServerPkgStatDownload {
    downloads: number,
    day: string
}

// interface of data from the server api
interface ServerPkgStat {
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
interface Maintainer {
    email?: string,
    name?: string,
    url?: string
}

interface Repository {
    type?: string,
    url?: string
}

interface PackageInfo {
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
interface PackageStat {
    [key: string]: number
}

interface FetchHistory {
    packages: {
        [key: string]: 1 | 0 
    },
    count: number,
    total: number
}

class NpmTrending {
    private infoDb : {
        [key: string]: PackageInfo
    } = {};

    private statDb : {
        [key: string]: PackageStat
    } = {};

    private fetched : FetchHistory = {
        packages: {},
        total: 0,
        count: 0
    };

    // some variables for termination or analyse
    private _startTime = Date.now();
    private _lastFetched: number = 0;

    constructor() {
        this.init();
    }

    // path to store fetched data from previous runs
    static TEMP_DIR = joinPath(__dirname, ".tmp");
    static MESSAGE_FILE = joinPath(__dirname, "message");
    static FETCHED_PACKAGE_FILE = joinPath(NpmTrending.TEMP_DIR, "fetched.json");
    static INFO_DB_PREFIX = "info-";
    static STAT_DB_PREFIX = "stat-";

    // seed file that we will start our random crawling
    static SEED_FILE = joinPath(__dirname, "seed");

    // path to store fetched data(by every day)
    static DATA_DIR = "data";

    // configs
    static TIME_OUT = 3 * 60 * 1000; // (3m)

    // queue for fetching
    private queue : string[] = [];

    @Once()
    private _getFetched() : FetchHistory {
        let file = NpmTrending.FETCHED_PACKAGE_FILE;
        ensureFileSync(file);
        try {
            return readJsonSync(file);
        } catch(e) {
            return this.fetched;
        }

    }

    // write db and update fetched history files
    private _writeFiles() : void {
        // if no data fetched, no need to write anything
        if (!Object.keys(this.infoDb).length || !Object.keys(this.statDb).length) return;

        let infoDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.INFO_DB_PREFIX + this.fetched.count + ".json")
        let statDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.STAT_DB_PREFIX + this.fetched.count + ".json")
        ensureFileSync(infoDb);
        ensureFileSync(statDb);
        ensureFileSync(NpmTrending.FETCHED_PACKAGE_FILE);

        // write db files
        writeJsonSync(infoDb, this.infoDb);
        writeJsonSync(statDb, this.statDb);

        // update fetchHistory
        this.fetched.count++;
        writeJsonSync(NpmTrending.FETCHED_PACKAGE_FILE, this.fetched);

        // update seed
        let seed = "";
        if (this.queue.length) seed += this.queue.join(",");
        else seed = "xo,webpack";  // default seed: will be used if no queue, it will be used for next day's initial fetch
        writeFileSync(NpmTrending.SEED_FILE, seed, "utf-8");

        // update message
        writeFileSync(NpmTrending.MESSAGE_FILE, `#${this.fetched.count} fetch finished! ${this.fetched.total - this._lastFetched} packages fetched this time.`, "utf-8");


        // reset infoDb and statDb
        this.infoDb = {};
        this.statDb = {};
    }

    // init so it knows what to fetch
    init(): void {
        // check if today's job is already finished
        let date = new Date().toISOString().split("T")[0];
        if (pathExistsSync(joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX + date + ".json"))) return;

        // try load previous fetched data (so we don't need to fetch those packages again)
        this.fetched = this._getFetched();
        this._lastFetched = this.fetched.total;

        ensureFileSync(NpmTrending.SEED_FILE);

        // parse seed file, remove fetched
        this.queue = (readFileSync(NpmTrending.SEED_FILE, 'utf8')).split(",").map(v => v.trim()).filter(v => !this.fetched[v]);

        // now lets fetch
        this.fetch()
            .finally(() => this._writeFiles());
    }

    // fetch
    // 1. no fetch on fetched packages
    // 2. handle errors gracefully
    // 3. update info when needed (optional)
    // 4. terminate after 3minute
    fetch() : Promise<any> {
        // terminate when no pkg in the queue
        // will happen when we almost fetched everything :)
        // TODO: not sure about the total number of packages we can fetch in a day
        if (!this.queue.length || this.fetched.total > 100000) {
            // call it a day :)
            return this._concat();
        }

        // DEBUG - see how fast the queue can go
        // console.log(this.queue.length);

        // terminate if time's up
        if (Date.now() - this._startTime > NpmTrending.TIME_OUT) return Promise.resolve();

        // change 2 to control how many requests can be sent at the same time
        return Promise.all(new Array(3).fill(1).map(() => this.fetchPkgInfo(this.queue.pop())))
            .then(data => {
                // name is a required field for a valid pkg
                data = data.filter(pkg => pkg && !pkg.error && pkg.name);

                // store info to infoDb with `lastFetchedTime`
                // and add their dependencies(if not fetched) to the queue
                data.forEach(pkg => {
                    let keys = ["maintainers", "time", "author", "repository", "description", "homepage", "license"];
                    this.infoDb[pkg.name] = { lastFetched: Date.now(), name: pkg.name };
                    keys.forEach(key => this.infoDb[pkg.name][key] = pkg[key]);

                    let versions = pkg.versions && Object.keys(pkg.versions).sort((a, b) => a.localeCompare(b));
                    if (versions && versions.length >= 1) {
                        let latest = pkg.versions[versions[versions.length - 1]];
                        Object.keys(latest.dependencies || {}).forEach(dep => this.fetched.packages[dep] || this.queue.push(dep));
                        Object.keys(latest.devDependencies || {}).forEach(dep => this.fetched.packages[dep] || this.queue.push(dep));
                    }
                });

                // fetch pkg stats
                return Promise.all(data.map(pkg => this.fetchPkgStat(pkg.name)));
            })
            .then(data => {
                // downloads will be a required field for stats
                data = data.filter(pkg => pkg && !pkg.error && pkg.downloads);

                data.forEach(pkg => {
                    pkg.downloads.forEach(download => {
                        this.statDb[pkg.package] = this.statDb[pkg.package] || {};

                        // don't store 0 (save space)
                        if (download.downloads) this.statDb[pkg.package][download.day] = download.downloads;
                    });
                });

                // start next round of request
                return this.fetch();
            })
    }

    // fetch pkg info
    fetchPkgInfo(pkg: string): Promise<any> {
        if (!pkg) return Promise.resolve({error: true});
        return rp({uri: "https://registry.npmjs.org/" + pkg, json: true}).catch(e => ({error: e}));
    }

    // fetch pkg stats
    fetchPkgStat(pkg: string): Promise<ServerPkgStat> {
        if (!pkg) return Promise.resolve({error: true});
        return rp({uri: "https://api.npmjs.org/downloads/range/last-year/" + pkg, json: true})
            .then(res => {
                // mark as fetched
                this.fetched.packages[pkg] = 1;
                this.fetched.total ++;
                return res;
            })
            .catch(e => ({error: e}));
    }

    // ready to concat all files
    private _concat() : Promise<void> {
        // write first
        this._writeFiles();

        let files = readdirSync(NpmTrending.TEMP_DIR);
        let infoFiles = files.filter(file => file.indexOf(NpmTrending.INFO_DB_PREFIX) > -1);
        let statFiles = files.filter(file => file.indexOf(NpmTrending.STAT_DB_PREFIX) > -1);

        let infoDb = {};
        let statDb = {};

        while (infoFiles.length) {
            let file = infoFiles.pop();
            Object.assign(infoDb, readJsonSync(joinPath(NpmTrending.TEMP_DIR, file)));
        }

        while (statFiles.length) {
            let file = statFiles.pop();
            Object.assign(statDb, readJsonSync(joinPath(NpmTrending.TEMP_DIR, file)));
        }

        let date = new Date().toISOString().split("T")[0];

        let infoDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX + date + ".json");
        let statDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.STAT_DB_PREFIX + date + ".json");
        ensureFileSync(infoDbFile);
        ensureFileSync(statDbFile);

        writeJsonSync(infoDbFile, infoDb);
        writeJsonSync(statDbFile, statDb);

        // remove _temp
        removeSync(NpmTrending.TEMP_DIR);

        // update message
        writeFileSync(NpmTrending.MESSAGE_FILE, `We have finished the job for ${date}! ${this.fetched.total} packages fetched today.`, "utf-8");

        return Promise.resolve();
    }
}

let npm = new NpmTrending();