/**
 * generate a json contains the data that will be consumed by the html template
 * 
 * - expect to be ran everyday, so the data file name will be yyyy-month-day
 */


import { writeJsonSync, ensureFileSync } from "fs-extra";
import { Analyze, Package } from "./ds";
import { join } from "path";

interface DailyReport {
    date: string,
    title: string;
    total: number;
    dayInc: Package[];
    dayChange: Package[];
    dayTop: Package[];
}


export class Generator {
    private analyze: Analyze;
    constructor(date: string = new Date().toISOString().split("T")[0]) {
        this.analyze = new Analyze(date);
    };

    static DIST_DIR = join(__dirname, "..", "dist");
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