/**
 * generate a json contains the data that will be consumed by the html template
 * 
 * - expect to be ran everyday, so the data file name will be yyyy-month-day
 */


import { copySync } from "fs-extra";
import { Generator } from "./lib/generator";
import { join } from "path";

let generator = new Generator();
let endDate = new Date();
let date = new Date();
date.setDate(endDate.getDate() - 1);

while (date < endDate) {
    generator.generate(date.toISOString().split("T")[0]);
    date.setDate(date.getDate() + 1);
}

// move over assets and template
copySync(join(__dirname, "template"), join(Generator.DIST_DIR));
