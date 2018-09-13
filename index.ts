/**
 * 
 * Update @ 2018/8/30
 * 
 * move to typescript and circleCI.
 * 
 * Goal: use circleCI to fetch / update / deploy continuously
 * Limit: free tier for circleCI limits to 1 job <= 5min (which won't be enough to fetch all packages...)
 * Solution:
 *  - run same job multiple times and store all results
 *  - concatenate all results
 * 
 * 
 * TODO:
 * - record all packages not found (so we don't need to fetch it so frequently, based on our existing data, we should have quite a few)
 */

import * as Promise from 'bluebird';
import * as rp from "request-promise";
import { readJsonSync, ensureFileSync, writeJsonSync, readFileSync, writeFileSync, readdirSync, removeSync, pathExistsSync } from "fs-extra";
import { Once } from "lodash-decorators";
import { join as joinPath } from "path";
import { ServerPkgStat, PackageStat, PackageInfo, FetchHistory, FetchStatus} from "./types";

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

    // queue for fetching
    private queue : string[] = [];

    // some variables for termination or analyse
    private _startTime = Date.now();
    private _lastFetched: number = 0;
    private _fetchErrors: number = 0;

    constructor() {
        this.init();

        // emit stats after run
        process.on('exit', (code) => {
            // get stats on each status
            let stats = Object.keys(this.fetched.packages).reduce((prev, cur) => {
                prev[this.fetched.packages[cur]] = prev[this.fetched.packages[cur]] || 0;
                prev[this.fetched.packages[cur]]++;
                return prev;
            }, {});
            console.log(`About to exit with code: ${code}`);
            console.log(`so far, we have fetched ${this.fetched.total} (${Object.keys(this.fetched.packages).length}), this time, we fetched ${this.fetched.total - this._lastFetched}, error: ${this._fetchErrors}`);
            console.log(`Among all fetched packages:
                ${stats[FetchStatus.InfoFetching] || 0} is fetching info(expect to be 0),
                ${stats[FetchStatus.InfoFetchFailed] || 0} failed to fetch info, pending retry(expect to be 0),
                ${stats[FetchStatus.InfoFetched] || 0} fetched info successfully,
                ${stats[FetchStatus.InfoFetchOver] || 0} failed to fetch info,
                ${stats[FetchStatus.Pending] || 0} is fetching stat (expect to be 0),
                ${stats[FetchStatus.Failed] || 0} failed to fetch stat, pending retry (expect to be 0),
                ${stats[FetchStatus.Done] || 0} fetched stat successfully,
                ${stats[FetchStatus.Over] || 0} failed to fetch stat after retry,
                ${this.queue.length} pkg in our current queue
                `);
        });
    }

    // path to store fetched data from previous runs
    static TEMP_DIR = joinPath(__dirname, ".tmp");
    static MESSAGE_FILE = joinPath(__dirname, "message");
    static FETCHED_PACKAGE_FILE = joinPath(NpmTrending.TEMP_DIR, new Date().toISOString().split("T")[0] + "-fetched.json");
    static INFO_DB_PREFIX = "info-" + new Date().toISOString().split("T")[0];
    static STAT_DB_PREFIX = "stat-" + new Date().toISOString().split("T")[0];

    // seed file that we will start our random crawling
    static SEED_FILE = joinPath(__dirname, "seed");

    // path to store fetched data(by every day)
    static DATA_DIR = "data";

    // configs
    static TIME_OUT = 5 * 60 * 1000; // (5m)
    static MAX_FETCH_ERRORS = 50;

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

        let infoDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.INFO_DB_PREFIX + "-" + this.fetched.count + ".json")
        let statDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.STAT_DB_PREFIX + "-" + this.fetched.count + ".json")
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
        else seed = Object.keys(this.statDb).join(",");  // default seed: will be used if no queue, it will be used for next day's initial fetch, the idea is all packages previous fetched should be included at least :)
        writeFileSync(NpmTrending.SEED_FILE, seed, "utf-8");

        // update message

        let date = new Date().toISOString().split("T")[0];
        writeFileSync(NpmTrending.MESSAGE_FILE, `Job ${this.fetched.count} fetch finished! ${this.fetched.total - this._lastFetched} packages fetched this time(${date}).`, "utf-8");

        // reset infoDb and statDb
        this.infoDb = {};
        this.statDb = {};
    }

    // init so it knows what to fetch
    init(): void {
        // check if today's job is already finished
        let date = new Date().toISOString().split("T")[0];
        if (pathExistsSync(joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX + ".json"))) return;

        // try load previous fetched data (so we don't need to fetch those packages again)
        this.fetched = this._getFetched();
        this._lastFetched = this.fetched.total;

        ensureFileSync(NpmTrending.SEED_FILE);

        // parse seed file, remove done / over
        this.queue = (readFileSync(NpmTrending.SEED_FILE, 'utf8')).split(",").map(v => v.trim()).filter(v => !this.fetched[v] || !(this.fetched[v] === FetchStatus.Done || this.fetched[v] === FetchStatus.Over));

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
        // from history data, we can fetch ~12k with what we have now, if we want to fetch more, we need new seed :)
        if (!this.queue.length || this.fetched.total > 100000) {
            // call it a day :)
            return this._concat();
        }
        
        // terminate this round if too many errors
        if (this._fetchErrors > NpmTrending.MAX_FETCH_ERRORS) {
            return Promise.resolve();
        }

        // DEBUG - see how fast the queue can go
        // console.log(this.queue.length);
        if ((this.fetched.total - this._lastFetched) % 100 === 0) {
            console.log(`${this.fetched.total - this._lastFetched} packages fetched! ${this._fetchErrors} errors occurred!`)
        }

        // terminate if time's up
        if (Date.now() - this._startTime > NpmTrending.TIME_OUT) return Promise.resolve();

        // change 10 to control how many requests can be sent at the same time
        return Promise.all(new Array(10).fill(1).map(() => this.fetchPkgInfo(this.queue.pop())))
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

                        // store deps and devDeps into info
                        this.infoDb[pkg.name].deps = Object.keys(latest.dependencies || {});
                        this.infoDb[pkg.name].devDeps = Object.keys(latest.devDependencies || {});

                        // add deps to the queue if its not in the list or not finished during previous fetches
                        this.infoDb[pkg.name].deps.forEach(dep => {
                            if (typeof this.fetched.packages[dep] === "undefined") this.queue.push(dep);
                        });
                        this.infoDb[pkg.name].devDeps.forEach(dep => {
                            if (typeof this.fetched.packages[dep] === "undefined") this.queue.push(dep);
                        });
                    }
                });

                // fetch pkg stats
                // 'scoped packages are not currently supported in bulk lookups' - so scopedPkg will need to be fetched individually
                let pkgToBeFetched = data.map(pkg => pkg.name);
                let scopedPkg = pkgToBeFetched.filter(pkg => pkg.indexOf("@") === 0);
                let bulkPkg = pkgToBeFetched.filter(pkg => pkg.indexOf("@") !== 0);
                return Promise.all([this.bulkFetchPkgStat(bulkPkg)].concat(scopedPkg.map(pkg => this.fetchPkgStat(pkg))));
            })
            .then(res => {
                res.forEach(data => {
                    // store results from bulk fetch
                    Object.keys(data).forEach(pkgName => {
                        let pkg = data[pkgName];
                        if (!pkg || pkg.error || !pkg.downloads) return;
                        pkg.downloads.forEach(download => {
                            this.statDb[pkg.package] = this.statDb[pkg.package] || {};

                            // don't store 0 (save space)
                            if (download.downloads) this.statDb[pkg.package][download.day] = download.downloads;
                        });
                    });
                })

                // start next round of request
                return this.fetch();
            })
    }

    // fetch pkg info
    fetchPkgInfo(pkg: string): Promise<any> {
        if (!pkg) return Promise.resolve({error: true});

        // skip fetching
        if (this.fetched.packages[pkg] == FetchStatus.InfoFetching) return Promise.resolve({});

        // skip fetched
        if (this.fetched.packages[pkg] == FetchStatus.InfoFetched) return Promise.resolve({});

        // skip over
        if (this.fetched.packages[pkg] == FetchStatus.InfoFetchOver) return Promise.resolve({});

        let promise = rp({uri: "https://registry.npmjs.org/" + pkg, json: true})
        .then(res => {
            this.fetched.packages[pkg] === FetchStatus.InfoFetched;
            return res;
        })
        .catch(e => {
            // allow one retry
            if (this.fetched.packages[pkg] === FetchStatus.InfoFetchFailed) this.fetched.packages[pkg] = FetchStatus.InfoFetchOver;
            else this.fetched.packages[pkg] === FetchStatus.InfoFetchFailed;
            this._fetchErrors++;
            console.log(e.message);
            return {error: e};
        });

        this.fetched.packages[pkg] = FetchStatus.InfoFetching;

        return promise;
    }

    // fetch pkg stats
    fetchPkgStat(pkg: string): Promise<{[key: string]: ServerPkgStat}> {
        if (!pkg) return Promise.resolve({[pkg]: {error: true}});

        // skip pending ones
        if (this.fetched.packages[pkg] === FetchStatus.Pending) return Promise.resolve({});

        // skip finished ones
        if (this.fetched.packages[pkg] === FetchStatus.Done) return Promise.resolve({});

        // skip over
        if (this.fetched.packages[pkg] === FetchStatus.Over) return Promise.resolve({});

        let promise = rp({uri: "https://api.npmjs.org/downloads/range/last-week/" + pkg, json: true})
            .then(res => {
                // mark as fetched
                this.fetched.packages[pkg] = FetchStatus.Done;
                this.fetched.total ++;
                return {[pkg]: res};
            })
            .catch(e => {
                this._errorHandler(e, [pkg]);
                return {[pkg]: {error: e}};
            });

        // set to pending
        this.fetched.packages[pkg] = FetchStatus.Pending;

        return promise;
    }

    // fetch stats for multiple packages at once
    bulkFetchPkgStat(packages: string[] = []) : Promise<{[key: string]: ServerPkgStat}> {
        // remove fetched and fetching
        packages = packages.filter(pkg => this.fetched.packages[pkg] !== FetchStatus.Done
            && this.fetched.packages[pkg] !== FetchStatus.Over
            && this.fetched.packages[pkg] !== FetchStatus.Pending);

        if (!packages.length) return Promise.resolve({all: {error: true}});

        // the request
        let promise = rp({uri: "https://api.npmjs.org/downloads/range/last-week/" + packages.join(","), json: true})
            .then(res => {
                // mark as fetched
                packages.forEach(pkg => {
                    this.fetched.packages[pkg] = FetchStatus.Done;
                    this.fetched.total ++;
                });
                return res;
            })
            .catch(e => {
                this._errorHandler(e, packages);
                return {all: {error: e}};
            });

        // set to Pending if its Ready
        packages.forEach(pkg => {
            this.fetched.packages[pkg] = FetchStatus.Pending;
        })

        return promise;
 
    }

    private _errorHandler(e: any, packages: string[]): void {
        this._fetchErrors++;

        // set failed to done (allow only one retry)
        packages.forEach(pkg => {
            if (this.fetched.packages[pkg] === FetchStatus.Failed) this.fetched.packages[pkg] = FetchStatus.Over
        });

        if (e.statusCode === 404) {
            // no need to retry for 404
            packages.forEach(pkg => this.fetched.packages[pkg] = FetchStatus.Over);
        } else {
            // mark as failed
            packages.forEach(pkg => {
                if (this.fetched.packages[pkg] !== FetchStatus.Over) this.fetched.packages[pkg] = FetchStatus.Failed
            });
        }

        console.log(packages.join(","), e.message);
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

        let infoDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX + ".json");
        let statDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.STAT_DB_PREFIX + ".json");
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