import { Generator } from "./lib/generator";
import { copySync } from "fs-extra";
import { join } from "path";
import { DateHelper } from "./lib/helpers";


// use 9/1 data to generate all reports between 2017-03-01 to 2018-09-01
// date = "2017-03-01";
// while (new Date(date) < new Date(startDate)) {
//     console.log("generating for", date);
//     let generator = new Generator(startDate);
//     generator.generate(date);
//     date = DateHelper.add(date, 1);
// }

// generate data from 9/1 to now
let generator = new Generator(DateHelper.add(DateHelper.today, -3));
if (!generator.noData) {
    // Regenerate all data with this fetch for past two weeks
    let numPastDays = 17;
    let i = 0;
    while (new Date(DateHelper.add(DateHelper.today, -numPastDays + i)) <= new Date(DateHelper.today)) {
        console.log("Generating for: ", DateHelper.add(DateHelper.today, -numPastDays + i));
        generator.generate(DateHelper.add(DateHelper.today, -numPastDays + i));
        i++;
    }
}

// move over assets and template
copySync(join(__dirname, "template"), join(Generator.DIST_DIR));
