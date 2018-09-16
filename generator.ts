/**
 * generate a json contains the data that will be consumed by the html template
 * 
 * - expect to be ran everyday, so the data file name will be yyyy-month-day
 */


import { copySync, writeFileSync, readFileSync, pathExistsSync, writeJSONSync, ensureFileSync } from "fs-extra";
import { Generator } from "./lib/generator";
import { join } from "path";
import { DateHelper } from "./lib/helpers";

let date = new Date();

// if data pkg not exists, do nothing
let dataPath = join(__dirname, "data", "stat-" + DateHelper.today + ".json");
if (pathExistsSync(dataPath)) {

    let generator = new Generator();
    let endDate = new Date(DateHelper.today);
    date.setDate(endDate.getDate() - 1);

    while (date < endDate) {
        generator.generate(date.toISOString().split("T")[0]);
        date.setDate(date.getDate() + 1);
    }
} else {
    let data = {
        "date": date.toISOString().split("T")[0],
        "title": "Npm Trending Report",
        "total": 0,
        "dayInc": [],
        "dayChange": [],
        "dayTop": []
    }
    console.log(DateHelper.today);
    console.log(join(Generator.REPORT_DIR, "pkg-" + DateHelper.today + ".json"))
    ensureFileSync(join(Generator.REPORT_DIR, "pkg-" + DateHelper.today + ".json"));
    writeJSONSync(join(Generator.REPORT_DIR, "pkg-" + DateHelper.today + ".json"), data);
}

// move over assets and template
copySync(join(__dirname, "template"), join(Generator.DIST_DIR));