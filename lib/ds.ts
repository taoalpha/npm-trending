'use strict';

/**
 * parse the data we retrieved and get some top / bottom packages
 */

import { readJsonSync, pathExistsSync } from "fs-extra";
import { join } from "path";
import { PackageInfo, PackageStat, Maintainer } from "./types";
import { DateHelper } from "./helpers";

interface GetTopOptions {
    minDownload?: number,
    changeThreshold?: number,
    incThreshold?: number
}

export interface Package {
    name: string,
    description?: string,
    homepage?: string,
    author?: string,
    status?: string,
    history?: number[],
    versions?: any,
    day?: string,
    download?: number,
    stats?: PackageStat,
    inc?: number,
    change?: number,
    numVersions?: number,
    numDependents?: number,
    numDevDependents?: number,
    created?: string,
    modified?: string,
    toJSON?: () => any
}

export interface Author extends Maintainer {
    packages?: string[];
    downloads?: {
        [key: string]: number
    };
    inc?: number;
    change?: number;
    status?: string;
}

interface GetTopKResponse {
    top: Package[],
    topChange: Package[],
    topIncrease: Package[]
}

export class Analyze {
    private infoDb: {
        [key: string]: PackageInfo
    } = {};

    private statDb: {
        [key: string]: PackageStat
    } = {};

    private prevStatDb: {
        [key: string]: PackageStat
    } = {};

    private keys: string[] = [];

    private prevDate: string;

    // indicate that no data for this date
    noData: boolean = false;

    constructor(private date: string = DateHelper.today) {
        if(!pathExistsSync(join(__dirname, "../data/stat-" + this.date + ".json"))) {
            this.noData = true;
            console.log("no data found for: ", date);
            return this;
        }

        this.prevDate = DateHelper.add(date, -1);
        this.statDb = this.getDb(date, "stat");
        this.infoDb = this.getDb(date, "info");
        this.keys = Object.keys(this.statDb);

        while(!pathExistsSync(join(__dirname, "../data/stat-" + this.prevDate + ".json"))) {
            this.prevDate = DateHelper.add(this.prevDate, -1);
        }

        // to get diff
        this.prevStatDb = this.getDb(this.prevDate, "stat");
    }

    getDb(date, type) {
        const db = readJsonSync(join(__dirname, `../data/${type}-` + date + ".json"));
        const subFiles = db["__npm_trending_sub_files__"];
        if (subFiles && subFiles.length) {
            let res = {};
            for (let subDbFile of subFiles) {
                const subDb = readJsonSync(join(__dirname, `../data/${subDbFile}`));
                // merge into res
                Object.assign(res, subDb);
            }
            return res;
        } else {
            return db;
        }
    }

    // get new packages fetched compared to previous day
    getDiff(date: string = this.date): Package[] {
        let newPackages = this.keys.filter(key => !this.prevStatDb[key]);
        return newPackages.map(pkg => this._fillInPackage({ name: pkg, stat: this.statDb[pkg] }, date));
    }

    getPkgWithMostVersions(K: number): Package[] {
        return this.keys.filter(pkg => this.infoDb[pkg].time).sort((pkgA, pkgB) => {
            return Object.keys(this.infoDb[pkgB].time).length - Object.keys(this.infoDb[pkgA].time).length;
        }).slice(0, K).map(pkg => {
            let p = this._fillInPackage({name: pkg, stat: this.statDb[pkg]}, this.date)
            p.numVersions = Object.keys(this.infoDb[pkg].time).length - 2;
            return p;
        });
    }

    getOldestPkg(K: number): Package[] {
        return this.keys.filter(pkg => this.infoDb[pkg].time).sort((pkgA, pkgB) => {
            return +new Date(this.infoDb[pkgA].time.created) - +new Date(this.infoDb[pkgB].time.created);
        }).slice(0, K).map(pkg => {
            let p = this._fillInPackage({name: pkg, stat: this.statDb[pkg]}, this.date)
            p.created = this.infoDb[pkg].time.created;
            p.modified = this.infoDb[pkg].time.modified;
            p.numVersions = Object.keys(this.infoDb[pkg].time).length - 2;
            return p;
        });
    }

    getNewestPkg(K: number): Package[] {
        return this.keys.filter(pkg => this.infoDb[pkg].time).sort((pkgA, pkgB) => {
            return +new Date(this.infoDb[pkgB].time.created) - +new Date(this.infoDb[pkgA].time.created);
        }).slice(0, K).map(pkg => {
            let p = this._fillInPackage({name: pkg, stat: this.statDb[pkg]}, this.date)
            p.created = this.infoDb[pkg].time.created;
            p.modified = this.infoDb[pkg].time.modified;
            p.numVersions = Object.keys(this.infoDb[pkg].time).length - 2;
            return p;
        });
    }

    getTopNotUpdatedPkg(K: number): Package[] {
        return this.keys.filter(pkg => this.infoDb[pkg].time).sort((pkgA, pkgB) => {
            return +new Date(this.infoDb[pkgA].time.modified) - +new Date(this.infoDb[pkgB].time.modified);
        }).slice(0, K).map(pkg => {
            let p = this._fillInPackage({name: pkg, stat: this.statDb[pkg]}, this.date)
            p.created = this.infoDb[pkg].time.created;
            p.modified = this.infoDb[pkg].time.modified;
            p.numVersions = Object.keys(this.infoDb[pkg].time).length - 2;
            return p;
        });
    }

    getTopRecentUpdatedPkg(K: number): Package[] {
        return this.keys.filter(pkg => this.infoDb[pkg].time).sort((pkgA, pkgB) => {
            return +new Date(this.infoDb[pkgB].time.modified) - +new Date(this.infoDb[pkgA].time.modified);
        }).slice(0, K).map(pkg => {
            let p = this._fillInPackage({name: pkg, stat: this.statDb[pkg]}, this.date)
            p.created = this.infoDb[pkg].time.created;
            p.modified = this.infoDb[pkg].time.modified;
            p.numVersions = Object.keys(this.infoDb[pkg].time).length - 2;
            return p;
        });
    }

    total(): number {
        return this.keys.length;
    }

    private getPastWeekData(pkg: string, date: string): number[] {
        let endDate = new Date(date);
        let startDate = new Date(date);
        startDate.setDate(startDate.getDate() - 6);
        let res = [];
        while (startDate <= endDate) {
            let day = startDate.toISOString().split("T")[0];
            res.push(this.statDb[pkg][day] || 0);
            startDate.setDate(startDate.getDate() + 1);
        }

        return res;
    }

    private _fillInPackage(pkg: { name: string, stat: PackageStat }, date: string): Package {
        // next date that has valid data should be the previous day of previous valid fetch day
        let prevDate = DateHelper.add(this.prevDate, -1);

        let pkgToAdd: Package = {
            name: pkg.name,
            history: this.getPastWeekData(pkg.name, date),
            [date]: pkg.stat[date] || 0,
            [prevDate]: pkg.stat[prevDate] || 0,
            get inc() {
                return this[date] - this[prevDate];
            },
            get change() {
                return this.inc / (this[prevDate] || 1);
            },
            get status() {
                return this[date] > this[prevDate] ? "arrow-up" : "arrow-down";
            }
        }

        if (this.infoDb[pkg.name]) {
            ["description", "homepage", "author"].forEach(key => {
                if (this.infoDb[pkg.name][key]) pkgToAdd[key] = this.infoDb[pkg.name][key];
            })
        }

        // fill in dependents info
        if (typeof this.infoDb[pkg.name].dependentCount !== "undefined") pkgToAdd.numDependents = this.infoDb[pkg.name].dependentCount;
        if (typeof this.infoDb[pkg.name].devDependentCount !== "undefined") pkgToAdd.numDevDependents = this.infoDb[pkg.name].devDependentCount;

        // add versions
        pkgToAdd.versions = this.infoDb[pkg.name].time || {};

        return pkgToAdd as Package;
    }

    getTop(K: number, date: string, options: GetTopOptions): GetTopKResponse {
        let packages: Package[] = this.keys.reduce((acc, key) => {
            if (!options.minDownload || this.statDb[key][date] > options.minDownload) {
                let pkgToAdd = this._fillInPackage({ name: key, stat: this.statDb[key] }, date);
                acc.push(pkgToAdd);
            }
            return acc;
        }, []);

        let topK = packages
            .sort((pkgA, pkgB): number => pkgB[date] - pkgA[date])
            .slice(0, K);
        
        let topKIncrease = packages
            .sort((pkgA, pkgB): number => pkgB.inc - pkgA.inc)
            .reduce((acc, pkg) => {
                if (!options.incThreshold || pkg.inc > options.incThreshold) acc.push(pkg)
                return acc;
            }, []).slice(0, K);

        let topKChange = packages
            .sort((pkgA, pkgB): number => pkgB.change - pkgA.change)
            .reduce((acc, pkg) => {
                if (!options.changeThreshold || pkg.change > options.changeThreshold) acc.push(pkg)
                return acc;
            }, []).slice(0, K);

        return { top: topK, topChange: topKChange, topIncrease: topKIncrease };
    }

    // TODO: maybe create a shared wash method with getTop to clean the data and make it ready to process
    getTopDep(K: number, date: string, options: GetTopOptions) {
        let packages: Package[] = this.keys.reduce((acc, key) => {
            if (!options.minDownload || this.statDb[key][date] > options.minDownload) {
                let pkgToAdd = this._fillInPackage({ name: key, stat: this.statDb[key] }, date);
                acc.push(pkgToAdd);
            }
            return acc;
        }, []);

        let topKDependent = packages
            .sort((pkgA, pkgB): number => pkgB.numDependents - pkgA.numDependents)
            .slice(0, K);

        let topKDevDependent = packages
            .sort((pkgA, pkgB): number => pkgB.numDevDependents - pkgA.numDevDependents)
            .slice(0, K);

        return {topDep: topKDependent, topDevDep: topKDevDependent};
    }

    getTopDeveloper(K: number, date: string, options: GetTopOptions) {
        let prevDate = DateHelper.add(date, -1);

        let authors = this.keys.reduce((authors, key) => {
            let pkg = this.infoDb[key],
                pkgStat = this.statDb[key];
            
            if (pkg && pkg.author && pkg.author.email) {
                // init author container
                let authorEmail = pkg.author.email;
                authors[authorEmail] = authors[authorEmail] || { 
                    packages: [],
                    downloads: {},
                    get inc() {
                        return (this.downloads[date] || 0) - (this.downloads[prevDate] || 0);
                    },
                    get change() {
                        return this.inc / (this.downloads[prevDate] || 1);
                    },
                    get status() {
                        return this.downloads[date] > this.downloads[prevDate] ? "arrow-up" : "arrow-down";
                    }
                } as Author;

                Object.assign(authors[authorEmail], pkg.author);

                authors[authorEmail].packages.push(pkg.name);
                Object.keys(pkgStat).forEach(date => {
                    authors[authorEmail].downloads[date] = authors[authorEmail].downloads[date] || 0;
                    authors[authorEmail].downloads[date] += pkgStat[date];
                });
            }
            return authors;
        }, {} as {[key: string]: Author});

        let filteredAuthors = Object.values(authors).filter(author => author.downloads[date] > (options.minDownload || 0));

        let topKDeveloper = filteredAuthors
            .sort((authorA, authorB): number => authorB.downloads[date] - authorA.downloads[date])
            .slice(0, K);

        let topKIncreaseDeveloper = filteredAuthors
            .sort((authorA, authorB): number => authorB.inc - authorA.inc)
            .slice(0, K);
 
        let topKChangeDeveloper = filteredAuthors
            .sort((authorA, authorB): number => authorB.change - authorA.change)
            .slice(0, K);
 
        return { topDeveloper: topKDeveloper, topIncreaseDeveloper: topKIncreaseDeveloper, topChangeDeveloper: topKChangeDeveloper};
    }
}

// console.log(new Analyze().getTop(20, "2018-09-13", { minDownload: 100 }).top.map(pkg => pkg.name + "-" + pkg.change).join(","))
// console.log(new Analyze("2018-09-11").getDiff().map(pkg => pkg.name).join(","))
// console.log(new Analyze("2018-09-11").getPkgWithMostVersions(10))
// console.log(new Analyze("2018-09-11").getOldestPkg(10))
// console.log(new Analyze("2018-09-11").getNewestPkg(10))
// console.log(new Analyze("2018-09-11").getTopNotUpdatedPkg(10))
// console.log(new Analyze("2018-09-11").getTopRecentUpdatedPkg(10))
// console.log(new Analyze("2018-09-16").getTopDep(10, "2018-09-15", {minDownload: 100}));
// console.log(new Analyze("2018-09-16").getTopDeveloper(10, "2018-09-15", {minDownload: 100}));