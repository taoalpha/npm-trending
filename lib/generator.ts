/**
 * generate a json contains the data that will be consumed by the html template
 * 
 * - expect to be ran everyday, so the data file name will be yyyy-month-day
 */


import { writeJsonSync, ensureFileSync, writeJSONSync } from "fs-extra";
import { Analyze, Package, Author } from "./ds";
import { join } from "path";
import { DateHelper } from "./helpers";

interface DailyReport {
    date: string,
    title: string;
    total: number;
    dayInc: Package[];
    dayChange: Package[];
    dayTop: Package[];
    dayNew?: Package[];
    dayDep?: Package[];
    dayDevDep?: Package[];
    dayTopDeveloper?: Author[];
    dayIncDeveloper?: Author[];
    dayChangeDeveloper?: Author[];
}


export class Generator {
    private analyze: Analyze;
    constructor(public date: string = DateHelper.today) {
        this.analyze = new Analyze(date);
    };

    static DIST_DIR = join(__dirname, "..", "dist");
    static REPORT_DIR = join(Generator.DIST_DIR, "reports");

    get noData(): boolean {
        return this.analyze.noData;
    }

    generate(date: string = DateHelper.add(this.date, -1)) : void {
        // if no data, generate with placeholder
        if (this.analyze.noData) {
            let data = {
                "date": date,
                "title": "Npm Trending Report",
                "total": 0,
                "dayInc": [],
                "dayChange": [],
                "dayTop": []
            }
            ensureFileSync(join(Generator.REPORT_DIR, "pkg-" + date + ".json"));
            writeJSONSync(join(Generator.REPORT_DIR, "pkg-" + date + ".json"), data);
            return;
        }
        let {top, topIncrease, topChange} = this.analyze.getTop(25, date, {
            minDownload: 100
        });
        let {topDep, topDevDep} = this.analyze.getTopDep(25, date, {
            minDownload: 100
        });
        let dayData : DailyReport = {
            date: date,
            title: "Npm Trending Report",
            total: this.analyze.total(),
            dayInc: topIncrease,
            dayChange: topChange,
            dayTop: top
        };

        // dayNew added after 09/05
        if (DateHelper.compare(date, "2018-09-05") === 1) {
            dayData.dayNew = this.analyze.getDiff(date)
        }

        // dayDep and dayDevDep adde after 9/15
        if (DateHelper.compare(date, "2018-09-14") === 1) {
            dayData.dayDep = topDep;
            dayData.dayDevDep = topDevDep;
        }

        // dayTopDeveloper + dayChangeDeveloper + dayIncDeveloper added after 9/1
        if (DateHelper.compare(date, "2018-09-01") === 1) {
            let {topDeveloper, topIncreaseDeveloper, topChangeDeveloper} = this.analyze.getTopDeveloper(25, date, {
                minDownload: 100
            });
            dayData.dayTopDeveloper = topDeveloper;
            dayData.dayIncDeveloper = topIncreaseDeveloper;
            dayData.dayChangeDeveloper = topChangeDeveloper;
        }

        let filePath = join(Generator.REPORT_DIR, "pkg-" + date + ".json");

        ensureFileSync(filePath);

        writeJsonSync(filePath, dayData);
    }
}