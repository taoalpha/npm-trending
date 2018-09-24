import { Generator } from "./lib/generator";
import { copySync } from "fs-extra";
import { join } from "path";
import { DateHelper } from "./lib/helpers";

let startDate = "2018-09-02";
let date;

// use 9/1 data to generate all reports between 2017-03-01 to 2018-09-01
// date = "2017-03-01";
// while (new Date(date) < new Date(startDate)) {
//     let generator = new Generator(startDate);
//     generator.generate(date);
//     date = DateHelper.add(date, 1);
// }

// generate data from 9/1 to now
date = startDate;
while (new Date(date) < new Date(DateHelper.add(DateHelper.today, -1))) {
    let generator = new Generator(DateHelper.add(date, 1));
    generator.generate(date);
    date = DateHelper.add(date, 1);
}

// move over assets and template
copySync(join(__dirname, "template"), join(Generator.DIST_DIR));