import * as Promise from 'bluebird';
import { NpmTrending } from "./lib/fetcher";
import { FetchStatus, EndEventRest } from "./lib/types";
import { DateHelper } from "./lib/helpers";
import { copySync, pathExistsSync, writeJSONSync, ensureFileSync, readdirSync } from "fs-extra";
import { Generator } from "./lib/generator";
import { join } from "path";

NpmTrending.TIME_OUT = 2 * 1000;
NpmTrending.MAX_NUM_PACKAGES = 100;

const npmJob = (date: string = DateHelper.today) : Promise<NpmTrending> => {
    let promise = new Promise<NpmTrending>((resolve, reject) => {

        let npm = new NpmTrending(date);

        let numErrors = 0;
        npm.on("error", (...args) => {
            numErrors++;
        });

        npm.on("end", (n: NpmTrending, rest: EndEventRest = {}) => {
            // if end with _concat, output the seeds length
            if (rest.seeds) console.log("next round seed length: ", rest.seeds.length);

            if (rest.msg) console.log(rest.msg);

            if (rest.error) console.log(rest.error);

            // get stats on each status
            // let stats = Object.keys(n.fetched).reduce((prev, cur) => {
            //     prev[n.fetched[cur]] = prev[n.fetched[cur]] || 0;
            //     prev[n.fetched[cur]]++;
            //     return prev;
            // }, {});

            console.log(`so far, we have fetched ${n.total()} (${Object.keys(n.fetched).length}), this time, we fetched ${n.total(true)}, error: ${numErrors}`);
            console.log(`${n.queue.length} pkg in our current queue`);
            // console.log(`Among all fetched packages:
            //     ${stats[FetchStatus.InfoFetching] || 0} is fetching info(expect to be 0),
            //     ${stats[FetchStatus.InfoFetchFailed] || 0} failed to fetch info, pending retry(expect to be 0),
            //     ${stats[FetchStatus.InfoFetched] || 0} fetched info successfully,
            //     ${stats[FetchStatus.InfoFetchOver] || 0} failed to fetch info,
            //     ${stats[FetchStatus.Pending] || 0} is fetching stat (expect to be 0),
            //     ${stats[FetchStatus.Failed] || 0} failed to fetch stat, pending retry (expect to be 0),
            //     ${stats[FetchStatus.Done] || 0} fetched stat successfully,
            //     ${stats[FetchStatus.Over] || 0} failed to fetch stat after retry,
            //     ${n.queue.length} pkg in our current queue
            //     `);

            // if done with the day, start generating the report and push to github
            if (rest.finish) {
                resolve(npm);
            }

            if (rest.error) {
                reject(rest.error);
            }
        });

        npm.on("fetchBatch", (n: NpmTrending) => {
            // DEBUG - see how fast the queue can go
            if ((n.total(true)) % 100 === 0) {
                console.log(`${n.total(true)} packages fetched!`);
            }
        });

        npm.init();
    });

    return promise.then(npm => {
        // run generator
        // if data pkg not exists, do nothing
        let dataPath = join(__dirname, "data", "stat-" + date + ".json");
        if (pathExistsSync(dataPath)) {

            let generator = new Generator(date);
            generator.generate(DateHelper.add(date, -1));
        } else {
            let data = {
                "date": date,
                "title": "Npm Trending Report",
                "total": 0,
                "dayInc": [],
                "dayChange": [],
                "dayTop": []
            }
            ensureFileSync(join(Generator.REPORT_DIR, "pkg-" + DateHelper.add(date, -1) + ".json"));
            writeJSONSync(join(Generator.REPORT_DIR, "pkg-" + DateHelper.add(date, -1) + ".json"), data);
        }

        // move over assets and template
        copySync(join(__dirname, "template"), join(Generator.DIST_DIR));
        return npm;
    });
}

let start = "2018-09-01";
let i = 0;
let promise;

while (new Date(DateHelper.add(start , i++)) <= new Date("2018-09-21")) {
// while (new Date(DateHelper.add(start , i++)) <= new Date(DateHelper.today)) {
    if (!pathExistsSync(join(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX(DateHelper.add(start, i - 1)) + ".json"))) {
        if (promise) promise = promise.then(() => npmJob(DateHelper.add(start, i - 1)));
        else promise = npmJob(DateHelper.add(start, i - 1));
    }
}