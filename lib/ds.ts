'use strict';

/**
 * parse the data we retrieved and get some top / bottom packages
 */

import { readJsonSync } from "fs-extra";
import { join } from "path";
import {PackageInfo, PackageStat} from "../types";
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
    day?: string,
    download?: number,
    stats?: PackageStat,
    inc?: number,
    change?: number,
    toJSON?: () => any
}

interface GetTopKResponse {
    top: Package[],
    topChange: Package[],
    topIncrease: Package[]
}

export class Analyze {
    private infoDb : {
        [key: string]: PackageInfo
    } = {};

    private prevInfoDb: {
        [key: string]: PackageInfo
    } = {};

    private statDb : {
        [key: string]: PackageStat
    } = {};

    private prevStatDb: {
        [key: string]: PackageStat
    } = {};

    private keys: string[] = [];
    private prevKeys: string[] = [];
   
    constructor(private date: string = DateHelper.today) {
        let prevDate = DateHelper.add(date, -1);
        this.statDb = readJsonSync(join(__dirname, "../data/stat-" + date + ".json"));
        this.prevStatDb = readJsonSync(join(__dirname, "../data/stat-" + prevDate + ".json"));
        this.infoDb = readJsonSync(join(__dirname, "../data/info-" + date + ".json"));
        this.prevInfoDb = readJsonSync(join(__dirname, "../data/info-" + prevDate + ".json"));
        this.keys = Object.keys(this.statDb);
        this.prevKeys = Object.keys(this.prevStatDb);
    }

    getDiff() : Package[] {
        let newPackages = this.keys.filter(key => !this.prevStatDb[key]);
        return newPackages.map(pkg => this._fillInPackage({name: pkg, stat: this.statDb[pkg]}, this.date));
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

    private _fillInPackage(pkg: {name: string, stat: PackageStat}, date: string) : Package {
        let tempDate = new Date(date);
        tempDate.setDate(tempDate.getDate() - 1);
        let prevDate = tempDate.toISOString().split("T")[0];

        let pkgToAdd: Package = {
            name: pkg.name,
            history: this.getPastWeekData(pkg.name, date),
            [date]: pkg.stat[date] || 0,
            [prevDate]: pkg.stat[prevDate] || 0,
            get inc() {
                return this[date] - this[prevDate];
            },
            get change() {
                return this.inc / (this[prevDate] | 1);
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

        return pkgToAdd as Package;
    }

    getTop(K: number, date: string, options: GetTopOptions): GetTopKResponse {
        let packages: Package[] = Object.keys(this.statDb).reduce((acc, key) => {
            if (!options.minDownload || this.statDb[key][date] > options.minDownload) acc.push(this._fillInPackage({name: key, stat: this.statDb[key]}, date));
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
    }
}

// console.log(new Analyze().getTop(20, "2018-09-08", { minDownload: 100 }).top.map(pkg => pkg.name + "-" + pkg.change).join(","))
// console.log(new Analyze("2018-09-11").getDiff().map(pkg => pkg.name).join(","))