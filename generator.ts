/**
 * generate a json contains the data that will be consumed by the html template
 * 
 * - expect to be ran everyday, so the data file name will be yyyy-month-day
 */


import { copySync, writeFileSync, readFileSync, pathExistsSync } from "fs-extra";
import { Generator } from "./lib/generator";
import { join } from "path";

let date = new Date();
// if data pkg not exists, do nothing
let dataPath = join(__dirname, "data", "stat-" + date.toISOString().split("T")[0] + ".json");
if (pathExistsSync(dataPath)) {

    let generator = new Generator();
    let endDate = new Date();
    date.setDate(endDate.getDate() - 1);


    while (date < endDate) {
        generator.generate(date.toISOString().split("T")[0]);
        date.setDate(date.getDate() + 1);
    }
}

// move over assets and template
copySync(join(__dirname, "template"), join(Generator.DIST_DIR));