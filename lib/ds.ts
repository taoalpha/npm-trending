'use strict';

/**
 * parse the data we retrieved and get some top / bottom packages
 */

import { readJsonSync } from "fs-extra";
import { join } from "path";
import {PackageInfo, PackageStat} from "../types";

export interface Package {
    name: string,
    description?: string,
    homepage?: string,
    author?: string,
    status?: string,
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
    private today : string = new Date().toISOString().split("T")[0];
    private infoDb : {
        [key: string]: PackageInfo
    } = {};

    private statDb : {
        [key: string]: PackageStat
    } = {};

    private keys: string[] = [];
   
    constructor(date?: string) {
        this.statDb = readJsonSync(join(__dirname, "../data/stat-" + (date || this.today) + ".json"));
        this.infoDb = readJsonSync(join(__dirname, "../data/info-" + (date || this.today) + ".json"));
        this.keys = Object.keys(this.statDb);
    }

    total(): number {
        return this.keys.length;
    }

    // get top increase compared to one day before
    getTop(K: number, date: string) {
        let topK: Package[] = [],
            topKIncrease: Package[] = [],
            topKChange: Package[] = [];
        let keys = this.keys;
        let i = 0, len = keys.length;
        let tempDate = new Date(date);
        tempDate.setDate(tempDate.getDate() - 1);
        let prevDate = tempDate.toISOString().split("T")[0];
        while (i < len) {
            let pkgToAdd: Package = {
                name: keys[i],
                [date]: this.statDb[keys[i]][date] || 0,
                [prevDate]: this.statDb[keys[i]][prevDate] || 0,
                get inc() {
                    return this[date] - this[prevDate];
                },
                get change() {
                    return this.inc / (this[prevDate] | 1);
                },
                get status() {
                    return this[date] > this[prevDate] ? "arrow-up" : "arrow-down";
                }
            };

            // fill in info
            if (this.infoDb[keys[i]]) {
                ["description", "homepage", "author"].forEach(key => {
                    if (this.infoDb[keys[i]][key]) pkgToAdd[key] = this.infoDb[keys[i]][key];
                })
            }

            // pkg that is checking against
            let swapPkg = pkgToAdd;

            // topK
            for (let j = 0; j < K; j++) {
                // if undefined, fill in
                if (!topK[j]) topK[j] = swapPkg;
 
                // if current one is smaller than swapPkg, swap
                if (topK[j][date] < swapPkg[date]) {
                    let temp = topK[j];
                    topK[j]  = swapPkg;
                    swapPkg = temp;
                }
            }

            // topKIncrease
            for (let j = 0; j < K; j++) {
                // if undefined, fill in
                if (!topKIncrease[j]) topKIncrease[j] = swapPkg;
 
                // if current one is smaller than swapPkg, swap
                if (topKIncrease[j].inc < swapPkg.inc) {
                    let temp = topKIncrease[j];
                    topKIncrease[j]  = swapPkg;
                    swapPkg = temp;
                }
            }

            // topKChange
            for (let j = 0; j < K; j++) {
                // if undefined, fill in
                if (!topKChange[j]) topKChange[j] = swapPkg;
 
                // if current one is smaller than swapPkg, swap
                if (topKChange[j].change < swapPkg.change) {
                    let temp = topKChange[j];
                    topKChange[j]  = swapPkg;
                    swapPkg = temp;
                }
            }
 
            i++;
        }
        return {top: topK, topChange: topKChange, topIncrease: topKIncrease};
    }
}

console.log(new Analyze("2018-08-31").getTop(200, "2018-08-30").topIncrease.map(v => v.name).join(","))