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

import * as rp from "request-promise";
import { readJsonSync, ensureFileSync, writeJsonSync, readFileSync, writeFileSync, readdirSync, removeSync, pathExistsSync, writeFile } from "fs-extra";
import { Once } from "lodash-decorators";
import { join as joinPath } from "path";
import { ServerPkgStat, PackageStat, PackageInfo, FetchHistory, FetchStatus, PKG_NOT_FOUND, Listener, EndEventRest } from "./types";
import { DateHelper } from './helpers';


export class NpmTrending {
    private _infoDb: {
        [key: string]: PackageInfo
    } = {};

    private _statDb: {
        [key: string]: PackageStat
    } = {};

    private _fetched: FetchHistory = {
        packages: {},
        total: 0,
        count: 0
    };

    private _notFound: {
        [key: string]: PKG_NOT_FOUND
    } = {};

    // queue for fetching
    private _queue: string[] = [];

    // some variables for termination or analyse
    private _startTime = Date.now();
    private _lastFetched: number = 0;
    private _fetchErrors: number = 0;

    private _listeners: {
        [key: string]: Listener[]
    } = {};

    constructor(private date: string = DateHelper.today, private range: number = 7) {
    }

    // path to store fetched data from previous runs
    static TEMP_DIR = joinPath(__dirname, "../.tmp");
    static MESSAGE_FILE = joinPath(__dirname, "../message");
    static MAX_SINGLE_FILE_CHAR_SIZE = 1048576 * 100;
    static FETCHED_PACKAGE_FILE(date: string = DateHelper.today) {
        return joinPath(NpmTrending.TEMP_DIR, date + "-fetched.json");
    }
    static INFO_DB_PREFIX(date: string = DateHelper.today): string {
        return "info-" + date;
    }
    static STAT_DB_PREFIX(date: string = DateHelper.today) {
        return "stat-" + date;
    }

    // store packages that not found, so we should not fetch those that often
    static PKG_NOT_FOUND_FILE = joinPath(__dirname, "../data", "404s.json");

    // seed file that we will start our random crawling
    static SEED_FILE = joinPath(__dirname, "../seed");

    // path to store fetched data(by every day)
    static DATA_DIR = "data";

    // configs
    static TIME_OUT = 8 * 60 * 1000; // (8m)
    static MAX_FETCH_ERRORS = 50;
    static SUSPEND_404_BASE_TIME = 7 * 24 * 60 * 60 * 1000; // 7days

    // TODO: not sure about the total number of packages we can fetch in a day
    // from history data, we can fetch ~12k with what we have now, if we want to fetch more, we need new seed :)
    static MAX_NUM_PACKAGES = 100000;

    // concurrent fetches that can run at a time
    static CONCURRENT_FETCHES = 15;

    static REQUEST_TIMEOUT = 3000;

    // APIs
    // depends
    static DEPENDED_PACKAGE_API(pkg: string): string {
        // from npm page, need change headers to make sure it return the json format instead of html
        // we probably don't need this one since we only care how many dependents instead of who they are
        return `https://www.npmjs.com/browse/depended/${pkg}`;
    }
    static PACKAGE_INFO_API(pkg: string): string {
        return `https://registry.npmjs.org/${pkg}`;
    }
    static PACKAGE_STAT_API(packages: string[], range: string): string {
        return `https://api.npmjs.org/downloads/range/${range}/${packages.join(",")}`;
    }


    @Once()
    private _getFetched(): FetchHistory {
        let file = NpmTrending.FETCHED_PACKAGE_FILE(this.date);
        ensureFileSync(file);
        try {
            return readJsonSync(file);
        } catch (e) {
            return this._fetched;
        }

    }

    // write db and update fetched history files
    private _writeFiles(): void {
        // if no data fetched, no need to write anything
        if (!Object.keys(this._infoDb).length || !Object.keys(this._statDb).length) return;

        let infoDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.INFO_DB_PREFIX(this.date) + "-" + this._fetched.count + ".json")
        let statDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.STAT_DB_PREFIX(this.date) + "-" + this._fetched.count + ".json")
        ensureFileSync(infoDb);
        ensureFileSync(statDb);
        ensureFileSync(NpmTrending.FETCHED_PACKAGE_FILE(this.date));

        // write db files
        writeJsonSync(infoDb, this._infoDb);
        writeJsonSync(statDb, this._statDb);

        // update fetchHistory
        this._fetched.count++;
        writeJsonSync(NpmTrending.FETCHED_PACKAGE_FILE(this.date), this._fetched);

        // write 404s
        writeJsonSync(NpmTrending.PKG_NOT_FOUND_FILE, this._notFound);

        // update seed
        writeFileSync(NpmTrending.SEED_FILE, this._queue.join(","), "utf-8");

        // update message
        writeFileSync(NpmTrending.MESSAGE_FILE, `Job ${this._fetched.count} fetch finished! ${this._fetched.total - this._lastFetched} packages fetched this time(${this.date}).`, "utf-8");

        // reset infoDb and statDb
        this._infoDb = {};
        this._statDb = {};
    }

    // init so it knows what to fetch
    init(): void {
        // check if today's job is already finished
        if (pathExistsSync(joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX(this.date) + ".json"))) {
            this.emit("end", {msg: `${this.date} Already fetched!`, finish: true} as EndEventRest);
            return;
        };

        // load 404s
        ensureFileSync(NpmTrending.PKG_NOT_FOUND_FILE);
        try {
            this._notFound = readJsonSync(NpmTrending.PKG_NOT_FOUND_FILE);
        } catch (e) {
            this._notFound = {};
        }

        // try load previous fetched data (so we don't need to fetch those packages again)
        this._fetched = this._getFetched();
        this._lastFetched = this._fetched.total;

        // parse seed file, remove done / over
        ensureFileSync(NpmTrending.SEED_FILE);
        this._queue = this._unique((readFileSync(NpmTrending.SEED_FILE, 'utf8')).split(",").map(v => v.trim()).filter(v => this._shouldFetch(v)));

        console.log(`Currently queue length: ${this._queue.length}, current fetched: ${this._fetched.total}, recorded 404s: ${Object.keys(this._notFound).length}`);
        console.log(`Sanity check: https://api.npmjs.org/downloads/point/${DateHelper.add(this.date, -1)}`);
        // sanity check
        rp({ uri: "https://api.npmjs.org/downloads/point/" + DateHelper.add(this.date, -1), json: true })
            .then(res => {
                console.log("Sanity result: ", res);
                // data has not filled in
                if (res.downloads === 0) {
                    this.emit("end", {msg: "No stats in the API!", finish: true} as EndEventRest)
                    return;
                }

                // now lets fetch
                this.fetch()
                    .finally(() => this._writeFiles());
            })
            .catch(e => {
                this.emit("end", {error: e} as EndEventRest)
            });
    }

    // set up listeners
    on(name: string, listener: Listener): void {
        this._listeners[name] = this._listeners[name] || [];
        this._listeners[name].push(listener);
    }

    // trigger listener
    private emit(name: string, ...args: any[]) {
        let listeners = this._listeners[name];
        if (listeners && listeners.length) {
            listeners.forEach(listener => {
                if (listener && typeof listener === "function") listener(...[this, ...args]);
            });
        }
    }

    private _unique(arr: string[]): string[] {
        return Array.from(new Set(arr));
    }

    private _shouldFetch(pkg: string): boolean {
        // invalid name
        if(pkg.indexOf("_") === 0) return false;

        let canFetch = true;
        if (this._notFound[pkg]) {
            // don't re-fetch those 404 packages too soon
            // every failed fetch will double the punishment in terms of suspension time for re-fetch
            canFetch = (Date.now() - this._notFound[pkg].lastFetchedDate) > (NpmTrending.SUSPEND_404_BASE_TIME * this._notFound[pkg].fetchedCount);
        }

        return canFetch &&
            // keep new packages (not recorded in fetched)
            (!this._fetched.packages[pkg] ||
                // keep pkg failed to fetch info or stat(but not over)
                (this._fetched.packages[pkg] === FetchStatus.Failed || this._fetched.packages[pkg] === FetchStatus.InfoFetchFailed)
            )
    }

    // fetch

    // 1. no fetch on fetched packages
    // 2. handle errors gracefully
    // 3. update info when needed (optional)
    // 4. terminate after 3minute
    fetch(): Promise<any> {
        // terminate when no pkg in the queue
        // will happen when we almost fetched everything :)
        if (!this._queue.length || this._fetched.total > NpmTrending.MAX_NUM_PACKAGES) {
            // call it a day :)
            return this._concat();
        }

        // terminate this round if too many errors
        if (this._fetchErrors > NpmTrending.MAX_FETCH_ERRORS) {
            this.emit("end", { msg: `Terminate because of too many errors: ${this._fetchErrors}!`, continue: true } as EndEventRest);
            return Promise.resolve();
        }

        // trigger the fetchBatch event
        this.emit("fetchBatch");

        // terminate if time's up
        if (Date.now() - this._startTime > NpmTrending.TIME_OUT) {
            this.emit("end", { msg: "Terminate because of timeout!", continue: true } as EndEventRest);
            return Promise.resolve();
        }

        // change #num here to control how many requests can be sent at the same time
        return Promise.all(new Array(NpmTrending.CONCURRENT_FETCHES).fill(null).map(() => this.fetchPkgInfo(this._queue.pop())))
            .then(data => {
                // name is a required field for a valid pkg
                data = data.filter(pkg => pkg && !pkg.error && pkg.name);

                // store info to infoDb with `lastFetchedTime`
                // and add their dependencies(if not fetched) to the queue
                data.forEach(pkg => {
                    let keys = ["maintainers", "time", "author", "repository", "description", "homepage", "license"];
                    this._infoDb[pkg.name] = this._infoDb[pkg.name] || { lastFetched: Date.now(), name: pkg.name, dependentCount: 0, devDependentCount: 0 };
                    let curPkg = this._infoDb[pkg.name];
                    keys.forEach(key => curPkg[key] = pkg[key]);

                    let versions = pkg.versions && Object.keys(pkg.versions).sort((a, b) => a.localeCompare(b));
                    if (versions && versions.length >= 1) {
                        let latest = pkg.versions[versions[versions.length - 1]];

                        // store deps and devDeps into info
                        curPkg.deps = Object.keys(latest.dependencies || {});
                        curPkg.devDeps = Object.keys(latest.devDependencies || {});

                        // add deps to the queue if its not in the list or not finished during previous fetches
                        // also record stats on dependentCount so we can track every package and how many packages depend on it
                        // will use this to improve our algorithm when calculate how popular the package is
                        // this data will be recorded every day, so we can concatenate those data and get more info on how its changed
                        curPkg.deps.forEach(dep => {
                            this._infoDb[dep] = this._infoDb[dep] || { name: dep, dependentCount: 0, devDependentCount: 0 };
                            this._infoDb[dep].dependentCount++;
                            if (this._shouldFetch(dep)) this._queue.push(dep);
                        });
                        curPkg.devDeps.forEach(dep => {
                            this._infoDb[dep] = this._infoDb[dep] || { name: dep, dependentCount: 0, devDependentCount: 0 };
                            this._infoDb[dep].devDependentCount++;
                            if (this._shouldFetch(dep)) this._queue.push(dep);
                        });

                        if (latest._npmUser) {
                            curPkg.author = curPkg.author || {};
                            if (typeof curPkg.author === "string") {
                                curPkg.author = {name: curPkg.author};
                            }
                            curPkg.author.alias = latest._npmUser.name;
                        }

                        // remove duplicates
                        this._queue = this._unique(this._queue);
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
                            this._statDb[pkg.package] = this._statDb[pkg.package] || {};

                            // don't store 0 (save space)
                            if (download.downloads) this._statDb[pkg.package][download.day] = download.downloads;
                        });
                    });
                })

                // start next round of request
                return this.fetch();
            })
    }

    // fetch pkg info
    fetchPkgInfo(pkg: string): Promise<any> {
        let promise = Promise.resolve({});
        if (!pkg) promise = Promise.resolve({ error: true });

        // skip fetching
        // skip fetched
        // skip over
        else if (this._fetched.packages[pkg] == FetchStatus.InfoFetching ||
            this._fetched.packages[pkg] == FetchStatus.InfoFetched ||
            this._fetched.packages[pkg] == FetchStatus.InfoFetchOver) promise = Promise.resolve({});
        else {
            promise = rp({ timeout: NpmTrending.REQUEST_TIMEOUT, uri: NpmTrending.PACKAGE_INFO_API(pkg), json: true })
                .then(res => {
                    this._fetched.packages[pkg] === FetchStatus.InfoFetched;
                    return res;
                })
                .catch(e => {
                    this._errorHandler(e, [pkg], "info");
                    return { error: e };
                });
            this._fetched.packages[pkg] = FetchStatus.InfoFetching;
        }

        return promise.then(res => {
            this.emit("fetchPkgInfo", res);
            return res;
        });
    }

    // fetch pkg stats
    fetchPkgStat(pkg: string): Promise<{ [key: string]: ServerPkgStat }> {
        let promise = Promise.resolve({});
        if (!pkg) promise = Promise.resolve({ [pkg]: { error: true } });

        // skip pending ones
        // skip finished ones
        // skip over
        else if (this._fetched.packages[pkg] === FetchStatus.Pending ||
            this._fetched.packages[pkg] === FetchStatus.Done ||
            this._fetched.packages[pkg] === FetchStatus.Over) promise = Promise.resolve({});
        else {
            promise = rp({ timeout: NpmTrending.REQUEST_TIMEOUT, uri: NpmTrending.PACKAGE_STAT_API([pkg], `${DateHelper.add(this.date, -this.range)}:${DateHelper.add(this.date, -1)}`), json: true })
                .then(res => {
                    // mark as fetched
                    this._fetched.packages[pkg] = FetchStatus.Done;
                    this._fetched.total++;
                    return { [pkg]: res };
                })
                .catch(e => {
                    this._errorHandler(e, [pkg]);
                    return { [pkg]: { error: e } };
                });

            // set to pending
            this._fetched.packages[pkg] = FetchStatus.Pending;
        }

        return promise.then(res => {
            this.emit("fetchPkgStat", res);
            return res;
        });
    }

    // fetch stats for multiple packages at once
    bulkFetchPkgStat(packages: string[] = []): Promise<{ [key: string]: ServerPkgStat }> {
        // remove fetched and fetching
        packages = packages.filter(pkg => this._fetched.packages[pkg] !== FetchStatus.Done
            && this._fetched.packages[pkg] !== FetchStatus.Over
            && this._fetched.packages[pkg] !== FetchStatus.Pending);

        let promise: Promise<any>;

        if (!packages.length) promise = Promise.resolve({ all: { error: true } });

        // fallback to single fetch if its length is 1
        else if (packages.length === 1) promise = this.fetchPkgStat(packages[0]);

        else {
            // the request
            promise = rp({ timeout: NpmTrending.REQUEST_TIMEOUT, uri: NpmTrending.PACKAGE_STAT_API(packages, `${DateHelper.add(this.date, -this.range)}:${DateHelper.add(this.date, -1)}`), json: true })
                .then(res => {
                    // mark as fetched
                    packages.forEach(pkg => {
                        this._fetched.packages[pkg] = FetchStatus.Done;
                        this._fetched.total++;
                    });
                    return res;
                })
                .catch(e => {
                    this._errorHandler(e, packages);
                    return { all: { error: e } };
                });

            // set to Pending if its Ready
            packages.forEach(pkg => {
                this._fetched.packages[pkg] = FetchStatus.Pending;
            })

        }
        return promise.then(res => {
            this.emit("bulkFetchPkgStat", res);
            return res;
        });

    }

    private _errorHandler(e: any, packages: string[], type: "stat" | "info" = "stat"): void {
        this._fetchErrors++;

        // log for records
        this.emit("error", type, packages, e);

        // 404 packages
        if (e.statusCode === 404 || e.message.error === "Not found") {
            // no need to retry for 404
            packages.forEach(pkg => {
                this._fetched.packages[pkg] = FetchStatus.Over

                // add to NOT_FOUND
                this._notFound[pkg] = this._notFound[pkg] || {
                    name: pkg,
                    type: type,
                    lastFetchedDate: Date.now(),
                    fetchedCount: 0
                };

                this._notFound[pkg].lastFetchedDate = Date.now();
                this._notFound[pkg].fetchedCount++;
            });
            return;
        }

        if (type === "stat") {
            // set failed to done (allow only one retry)
            // mark as failed
            packages.forEach(pkg => {
                if (this._fetched.packages[pkg] === FetchStatus.Failed) {
                    this._fetched.packages[pkg] = FetchStatus.Over
                }

                // mark rest as Fail and push them into queue
                if (this._fetched.packages[pkg] !== FetchStatus.Over) {
                    this._fetched.packages[pkg] = FetchStatus.Failed
                    this._queue.push(pkg);
                }
            });
        } else {
            // allow one retry
            if (this._fetched.packages[packages[0]] === FetchStatus.InfoFetchFailed) this._fetched.packages[packages[0]] = FetchStatus.InfoFetchOver;
            else {
                this._fetched.packages[packages[0]] === FetchStatus.InfoFetchFailed;
                this._queue.push(packages[0]);
            }
        }

        this._queue = this._unique(this._queue);
    }

    // ready to concat all files
    private _concat(): Promise<void> {
        // write first
        this._writeFiles();

        let files = readdirSync(NpmTrending.TEMP_DIR);
        let infoFiles = files.filter(file => file.indexOf(NpmTrending.INFO_DB_PREFIX(this.date)) > -1);
        let statFiles = files.filter(file => file.indexOf(NpmTrending.STAT_DB_PREFIX(this.date)) > -1);

        let infoDb = {};
        let statDb = {};

        while (infoFiles.length) {
            let file = infoFiles.pop();
            // can not just override, since different data files may have same package with different content(because of dependentCount)
            let data = readJsonSync(joinPath(NpmTrending.TEMP_DIR, file));
            Object.keys(data).forEach(key => {
                // if not exists, assign the value
                if (!infoDb[key]) return infoDb[key] = data[key];

                // use the one with more fields
                if (Object.keys(data[key]).length < Object.keys(infoDb[key]).length) {
                    infoDb[key].dependentCount += data[key].dependentCount;
                    infoDb[key].devDependentCount += data[key].devDependentCount;
                } else {
                    data[key].dependentCount += infoDb[key].dependentCount;
                    data[key].devDependentCount += infoDb[key].devDependentCount;
                    infoDb[key] = data[key];
                }
            });
        }

        while (statFiles.length) {
            let file = statFiles.pop();
            Object.assign(statDb, readJsonSync(joinPath(NpmTrending.TEMP_DIR, file)));
        }

        let infoDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX(this.date) + ".json");
        let statDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.STAT_DB_PREFIX(this.date) + ".json");
        ensureFileSync(infoDbFile);
        ensureFileSync(statDbFile);

        writeJsonSync(statDbFile, statDb);

        // Since github doesn't support files over 100MB, we need to split files here
        let seeds = Object.keys(infoDb);
        const chunksData = {"__npm_trending_sub_files__": []};
        let countOfChars = 0;
        let totalCountOfPkgs = 0;
        let lowerBound = 0;
        let batch = 0;
        while (totalCountOfPkgs < seeds.length) {
            const partialDb = {};
            for (let i = lowerBound; (countOfChars < NpmTrending.MAX_SINGLE_FILE_CHAR_SIZE) && (i < seeds.length); i++) {
                const key = seeds[i];
                partialDb[key] = infoDb[key];
                countOfChars += JSON.stringify(infoDb[key]).length;
                totalCountOfPkgs++;
                lowerBound++;
            }
            const partialDbPath = joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX(this.date) + "-" + batch + ".json");
            writeJsonSync(partialDbPath, partialDb);
            chunksData["__npm_trending_sub_files__"].push(NpmTrending.INFO_DB_PREFIX(this.date) + "-" + batch + ".json");
            batch++;
            countOfChars = 0;
        }
        writeJsonSync(infoDbFile, chunksData);

        // remove _temp
        removeSync(NpmTrending.TEMP_DIR);

        // update seed
        // default seed: will be used if no queue, it will be used for next day's initial fetch, the idea is all packages previous fetched should be included at least :)
        let randomIndices = new Array(seeds.length > 3 ? 3 : seeds.length).fill(null).map(() => Math.floor(Math.random() * seeds.length) + 1);

        // update message
        writeFileSync(NpmTrending.MESSAGE_FILE, `We have finished the job for ${this.date}! ${this._fetched.total} packages fetched today.`, "utf-8");

        return Promise.all(randomIndices.map(idx => this._randomSeed(seeds[idx])))
            .then(data => {
                data.forEach(dependedSeeds => {
                    dependedSeeds.forEach(s => {
                        if (s.indexOf("_") !== 0) seeds.push(s);
                    });
                });

                seeds = this._unique(seeds);

                writeFileSync(NpmTrending.SEED_FILE, seeds.join(","), "utf-8");

                this.emit("end", { seeds, finish: true } as EndEventRest);
                return;
            });
    }

    private _randomSeed(pkg: string): Promise<string[]> {
        return rp("https://www.npmjs.com/browse/depended/" + pkg)
            .then(d => {
                let reg = /\/package\/(.*?)\"/g;
                let res = [], group;
                while (group = reg.exec(d)) {
                    if (group[1]) res.push(group[1]);
                }
                return res;
            })
            .catch(e => {
                this.emit("error", "fetchSeed", pkg, e);
                return [];
            });
    }

    total(thisRoundOnly: boolean = false): number {
        return thisRoundOnly ? this._fetched.total - this._lastFetched : this._fetched.total;
    }

    get fetched(): {
        [key: string]: FetchStatus
    } {
        return this._fetched.packages;
    }

    get queue(): string[] {
        return this._queue;
    }

}
