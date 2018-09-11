import { Generator } from "./lib/generator";
import { copySync } from "fs-extra";
import { join } from "path";

let generator = new Generator("2018-09-01");
let endDate = new Date("2018-09-01");
let now = new Date();
let date = new Date("2017-03-01");

// use 9/1 data to generate all reports between 2017-03-01 to 2018-09-01
// while (date < endDate) {
    // generator.generate(date.toISOString().split("T")[0]);
    // date.setDate(date.getDate() + 1);
// }

// generate data from 9/1 to now
while (endDate < now) {
    date = new Date(endDate);
    generator = new Generator(endDate.toISOString().split("T")[0]);
    date.setDate(endDate.getDate() - 1);
    while (date < endDate) {
        generator.generate(date.toISOString().split("T")[0]);
        date.setDate(date.getDate() + 1);
    }

    // increase by 1
    endDate.setDate(endDate.getDate() + 1);
}

// move over assets and template
copySync(join(__dirname, "template"), join(Generator.DIST_DIR));