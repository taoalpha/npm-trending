/**
 * generate a json contains the data that will be consumed by the html template
 * 
 * - expect to be ran everyday, so the data file name will be yyyy-month-day
 */


import { readJsonSync, writeJsonSync, ensureFileSync, copySync } from "fs-extra";
import { Analyze, Package } from "./lib/ds";
import { join } from "path";

interface DailyReport{
    date: string,
    title: string;
    total: number;
    dayInc: Package[];
    dayChange: Package[];
    dayTop: Package[];
}


class Generator {
    private analyze: Analyze = new Analyze();
    constructor() {};

    static DIST_DIR = join(__dirname, "dist");
    static REPORT_DIR = join(Generator.DIST_DIR, "reports");

    generate(date: string) {
        if (!date) return;
        let {top, topIncrease, topChange} = this.analyze.getTop(25, date, {
            minDownload: 100
        });
        let dayData : DailyReport = {
            date: date,
            title: "Npm Trending Report",
            total: this.analyze.total(),
            dayInc: topIncrease,
            dayChange: topChange,
            dayTop:top
        };

        let filePath = join(Generator.REPORT_DIR, "pkg-" + date + ".json");

        ensureFileSync(filePath);

        writeJsonSync(filePath, dayData);
    }
}


let generator = new Generator();
let date = new Date("2017-03-01");
let endDate = new Date();

while (date < endDate) {
    generator.generate(date.toISOString().split("T")[0]);
    date.setDate(date.getDate() + 1);
}

// move over assets and template
copySync(join(__dirname, "template"), join(Generator.DIST_DIR));