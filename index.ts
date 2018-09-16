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
import { readJsonSync, ensureFileSync, writeJsonSync, readFileSync, writeFileSync, readdirSync, removeSync, pathExistsSync, writeFile } from "fs-extra";
import { Once } from "lodash-decorators";
import { join as joinPath } from "path";
import { ServerPkgStat, PackageStat, PackageInfo, FetchHistory, FetchStatus, PKG_NOT_FOUND} from "./types";
import { DateHelper } from './lib/helpers';

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

    private notFound: {
        [key: string]: PKG_NOT_FOUND
    } = {};

    // queue for fetching
    private queue : string[] = [];

    // some variables for termination or analyse
    private _startTime = Date.now();
    private _lastFetched: number = 0;
    private _fetchErrors: number = 0;

    constructor(private date: string = DateHelper.today) {
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
    static PKG_NOT_FOUND_FILE = joinPath(__dirname, "data", "404s.json");

    // seed file that we will start our random crawling
    static SEED_FILE = joinPath(__dirname, "seed");

    // path to store fetched data(by every day)
    static DATA_DIR = "data";

    // configs
    static TIME_OUT = 5 * 60 * 1000; // (5m)
    static MAX_FETCH_ERRORS = 50;
    static SUSPEND_404_BASE_TIME = 7 * 24 * 60 * 60 * 1000; // 7days


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
    private _getFetched() : FetchHistory {
        let file = NpmTrending.FETCHED_PACKAGE_FILE(this.date);
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

        let infoDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.INFO_DB_PREFIX(this.date) + "-" + this.fetched.count + ".json")
        let statDb = joinPath(NpmTrending.TEMP_DIR, NpmTrending.STAT_DB_PREFIX(this.date) + "-" + this.fetched.count + ".json")
        ensureFileSync(infoDb);
        ensureFileSync(statDb);
        ensureFileSync(NpmTrending.FETCHED_PACKAGE_FILE(this.date));

        // write db files
        writeJsonSync(infoDb, this.infoDb);
        writeJsonSync(statDb, this.statDb);

        // update fetchHistory
        this.fetched.count++;
        writeJsonSync(NpmTrending.FETCHED_PACKAGE_FILE(this.date), this.fetched);

        // write 404s
        writeJsonSync(NpmTrending.PKG_NOT_FOUND_FILE, this.notFound);

        // update seed
        writeFileSync(NpmTrending.SEED_FILE, this.queue.join(","), "utf-8");

        // update message
        writeFileSync(NpmTrending.MESSAGE_FILE, `Job ${this.fetched.count} fetch finished! ${this.fetched.total - this._lastFetched} packages fetched this time(${this.date}).`, "utf-8");

        // reset infoDb and statDb
        this.infoDb = {};
        this.statDb = {};
    }

    // init so it knows what to fetch
    init(): void {
        // check if today's job is already finished
        if (pathExistsSync(joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX(this.date) + ".json"))) return;

        // load 404s
        ensureFileSync(NpmTrending.PKG_NOT_FOUND_FILE);
        try {
            this.notFound = readJsonSync(NpmTrending.PKG_NOT_FOUND_FILE);
        } catch(e) {
            this.notFound = {};
        }

        // try load previous fetched data (so we don't need to fetch those packages again)
        this.fetched = this._getFetched();
        this._lastFetched = this.fetched.total;

        // parse seed file, remove done / over
        ensureFileSync(NpmTrending.SEED_FILE);
        this.queue = this._unique((readFileSync(NpmTrending.SEED_FILE, 'utf8')).split(",").map(v => v.trim()).filter(v => this._shouldFetch(v)));

        console.log(`Currently queue length: ${this.queue.length}, current fetched: ${this.fetched.total}, recorded 404s: ${Object.keys(this.notFound).length}`);

        // sanity check
        rp({uri: "https://api.npmjs.org/downloads/point/" + DateHelper.add(this.date, -1), json: true})
            .then(res => {
                // data has not filled in
                if (res.downloads === 0) {
                    console.log("No stats in the API!")
                    return;
                }

                // now lets fetch
                this.fetch()
                    .finally(() => this._writeFiles());
            })
            .catch(e => {
                console.log(e);
            });
    }

    private _unique(arr: string[]): string[] {
        return Array.from(new Set(arr));
    }

    private _shouldFetch(pkg: string): boolean {
        let canFetch = true;
        if (this.notFound[pkg]) {
            // don't re-fetch those 404 packages too soon
            // every failed fetch will double the punishment in terms of suspension time for re-fetch
            canFetch = (Date.now() - this.notFound[pkg].lastFetchedDate) > (NpmTrending.SUSPEND_404_BASE_TIME * this.notFound[pkg].fetchedCount);
        }

        return canFetch &&
            // keep new packages (not recorded in fetched)
            (!this.fetched.packages[pkg] ||
                // keep pkg failed to fetch info or stat(but not over)
                (this.fetched.packages[pkg] === FetchStatus.Failed || this.fetched.packages[pkg] === FetchStatus.InfoFetchFailed)
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

        // change #num here to control how many requests can be sent at the same time
        return Promise.all(new Array(15).fill(null).map(() => this.fetchPkgInfo(this.queue.pop())))
            .then(data => {
                // name is a required field for a valid pkg
                data = data.filter(pkg => pkg && !pkg.error && pkg.name);

                // store info to infoDb with `lastFetchedTime`
                // and add their dependencies(if not fetched) to the queue
                data.forEach(pkg => {
                    let keys = ["maintainers", "time", "author", "repository", "description", "homepage", "license"];
                    this.infoDb[pkg.name] = this.infoDb[pkg.name] || { lastFetched: Date.now(), name: pkg.name, dependentCount: 0, devDependentCount: 0 };
                    let curPkg = this.infoDb[pkg.name];
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
                            this.infoDb[dep] = this.infoDb[dep] || { name: dep, dependentCount: 0, devDependentCount: 0 };
                            this.infoDb[dep].dependentCount++;
                            if (this._shouldFetch(dep)) this.queue.push(dep);
                        });
                        curPkg.devDeps.forEach(dep => {
                            this.infoDb[dep] = this.infoDb[dep] || { name: dep, dependentCount: 0, devDependentCount: 0 };
                            this.infoDb[dep].devDependentCount++;
                            if (this._shouldFetch(dep)) this.queue.push(dep);
                        });

                        // remove duplicates
                        this.queue = this._unique(this.queue);
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
        if (!pkg) return Promise.resolve({ error: true });

        // skip fetching
        if (this.fetched.packages[pkg] == FetchStatus.InfoFetching) return Promise.resolve({});

        // skip fetched
        if (this.fetched.packages[pkg] == FetchStatus.InfoFetched) return Promise.resolve({});

        // skip over
        if (this.fetched.packages[pkg] == FetchStatus.InfoFetchOver) return Promise.resolve({});

        let promise = rp({ uri: NpmTrending.PACKAGE_INFO_API(pkg), json: true })
            .then(res => {
                this.fetched.packages[pkg] === FetchStatus.InfoFetched;
                return res;
            })
            .catch(e => {
                this._errorHandler(e, [pkg], "info");
                return { error: e };
            });

        this.fetched.packages[pkg] = FetchStatus.InfoFetching;

        return promise;
    }

    // fetch pkg stats
    fetchPkgStat(pkg: string): Promise<{ [key: string]: ServerPkgStat }> {
        if (!pkg) return Promise.resolve({ [pkg]: { error: true } });

        // skip pending ones
        if (this.fetched.packages[pkg] === FetchStatus.Pending) return Promise.resolve({});

        // skip finished ones
        if (this.fetched.packages[pkg] === FetchStatus.Done) return Promise.resolve({});

        // skip over
        if (this.fetched.packages[pkg] === FetchStatus.Over) return Promise.resolve({});

        let promise = rp({ uri: NpmTrending.PACKAGE_STAT_API([pkg], `${DateHelper.add(this.date, -7)}:${DateHelper.add(this.date, -1)}`), json: true })
            .then(res => {
                // mark as fetched
                this.fetched.packages[pkg] = FetchStatus.Done;
                // console.log("single: ", pkg, this.fetched.total);
                this.fetched.total++;
                return { [pkg]: res };
            })
            .catch(e => {
                this._errorHandler(e, [pkg]);
                return { [pkg]: { error: e } };
            });

        // set to pending
        this.fetched.packages[pkg] = FetchStatus.Pending;

        return promise;
    }

    // fetch stats for multiple packages at once
    bulkFetchPkgStat(packages: string[] = []): Promise<{ [key: string]: ServerPkgStat }> {
        // remove fetched and fetching
        packages = packages.filter(pkg => this.fetched.packages[pkg] !== FetchStatus.Done
            && this.fetched.packages[pkg] !== FetchStatus.Over
            && this.fetched.packages[pkg] !== FetchStatus.Pending);

        if (!packages.length) return Promise.resolve({ all: { error: true } });

        // the request
        let promise = rp({ uri: NpmTrending.PACKAGE_STAT_API(packages, `${DateHelper.add(this.date, -7)}:${DateHelper.add(this.date, -1)}`), json: true })
            .then(res => {
                // mark as fetched
                packages.forEach(pkg => {
                    this.fetched.packages[pkg] = FetchStatus.Done;
                    // console.log("multiple: ", pkg, this.fetched.total);
                    this.fetched.total++;
                });
                return res;
            })
            .catch(e => {
                this._errorHandler(e, packages);
                return { all: { error: e } };
            });

        // set to Pending if its Ready
        packages.forEach(pkg => {
            this.fetched.packages[pkg] = FetchStatus.Pending;
        })

        return promise;

    }

    private _errorHandler(e: any, packages: string[], type: "stat" | "info" = "stat"): void {
        this._fetchErrors++;

        // log for records
        console.log(packages.join(","), e.message);

        // 404 packages
        if (e.statusCode === 404 || e.message.error === "Not found") {
            // no need to retry for 404
            packages.forEach(pkg => {
                this.fetched.packages[pkg] = FetchStatus.Over

                // add to NOT_FOUND
                this.notFound[pkg] = this.notFound[pkg] || {
                    name: pkg,
                    type: type,
                    lastFetchedDate: Date.now(),
                    fetchedCount: 0
                };

                this.notFound[pkg].lastFetchedDate = Date.now();
                this.notFound[pkg].fetchedCount++;
            });
            return;
        }

        if (type === "stat") {
            // set failed to done (allow only one retry)
            // mark as failed
            packages.forEach(pkg => {
                if (this.fetched.packages[pkg] === FetchStatus.Failed) {
                    this.fetched.packages[pkg] = FetchStatus.Over
                }

                // mark rest as Fail and push them into queue
                if (this.fetched.packages[pkg] !== FetchStatus.Over) {
                    this.fetched.packages[pkg] = FetchStatus.Failed
                    this.queue.push(pkg);
                }
            });
        } else {
            // allow one retry
            if (this.fetched.packages[packages[0]] === FetchStatus.InfoFetchFailed) this.fetched.packages[packages[0]] = FetchStatus.InfoFetchOver;
            else {
                this.fetched.packages[packages[0]] === FetchStatus.InfoFetchFailed;
                this.queue.push(packages[0]);
            }
        }

        this.queue = this._unique(this.queue);
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

        // default seed: will be used if no queue, it will be used for next day's initial fetch, the idea is all packages previous fetched should be included at least :)
        writeFileSync(NpmTrending.SEED_FILE, Object.keys(statDb).join(","), "utf-8");

        let infoDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX(this.date) + ".json");
        let statDbFile = joinPath(NpmTrending.DATA_DIR, NpmTrending.STAT_DB_PREFIX(this.date) + ".json");
        ensureFileSync(infoDbFile);
        ensureFileSync(statDbFile);

        writeJsonSync(infoDbFile, infoDb);
        writeJsonSync(statDbFile, statDb);

        // remove _temp
        removeSync(NpmTrending.TEMP_DIR);

        // update message
        writeFileSync(NpmTrending.MESSAGE_FILE, `We have finished the job for ${this.date}! ${this.fetched.total} packages fetched today.`, "utf-8");

        return Promise.resolve();
    }
}

let npm = new NpmTrending();