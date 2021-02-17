import { NpmTrending } from "./lib/fetcher";
import { EndEventRest,FetchStatus } from "./lib/types";
import { DateHelper } from "./lib/helpers";
import { pathExistsSync, readJsonSync, writeJsonSync } from "fs-extra";
import { Generator } from "./lib/generator";
import { join } from "path";
import {promises as fsp} from "fs";
import * as ghPages from "gh-pages";

// NpmTrending.TIME_OUT = 10 * 60 * 1000;
// NpmTrending.MAX_NUM_PACKAGES = 100;
// NpmTrending.CONCURRENT_FETCHES = 5;

const npmJob = (range: number) : Promise<any> => {
    return new Promise<NpmTrending>((resolve, reject) => {

        let npm = new NpmTrending(DateHelper.today, range);

        let numErrors = 0;
        npm.on("error", (n, type, p, e) => {
            console.log(type, p, e.message);
            numErrors++;
        });

        npm.on("end", (n: NpmTrending, rest: EndEventRest = {}) => {
            // if end with _concat, output the seeds length
            if (rest.seeds) console.log("next round seed length: ", rest.seeds.length);

            if (rest.msg) console.log(rest.msg);

            if (rest.error) console.log(rest.error);

            // if has valid fetch: either it will continue, or its done with next round of seeds
            if (rest.continue || rest.seeds) {
                console.log(`so far, we have fetched ${n.total()} (${Object.keys(n.fetched).length}), this time, we fetched ${n.total(true)}, error: ${numErrors}`);
                console.log(`${n.queue.length} pkg in our current queue`);
            }

            // get stats on each status
            let stats = Object.keys(n.fetched).reduce((prev, cur) => {
                prev[n.fetched[cur]] = prev[n.fetched[cur]] || 0;
                prev[n.fetched[cur]]++;
                return prev;
            }, {});

            console.log(`Among all fetched packages:
                ${stats[FetchStatus.InfoFetching] || 0} is fetching info(expect to be 0),
                ${stats[FetchStatus.InfoFetchFailed] || 0} failed to fetch info, pending retry(expect to be 0),
                ${stats[FetchStatus.InfoFetched] || 0} fetched info successfully,
                ${stats[FetchStatus.InfoFetchOver] || 0} failed to fetch info,
                ${stats[FetchStatus.Pending] || 0} is fetching stat (expect to be 0),
                ${stats[FetchStatus.Failed] || 0} failed to fetch stat, pending retry (expect to be 0),
                ${stats[FetchStatus.Done] || 0} fetched stat successfully,
                ${stats[FetchStatus.Over] || 0} failed to fetch stat after retry,
                ${n.queue.length} pkg in our current queue
                `);

            // if done with the day, start generating the report and push to github
            if (rest.finish) {
                resolve(npm);
            } else {
                // if error, or just finish this day's job, then don't continue to next
                reject(rest.error);
            }

        });

        npm.on("fetchBatch", (n: NpmTrending) => {
            // DEBUG - see how fast the queue can go
            if ((n.total(true)) % 100 < 10) {
                console.log(`${n.total(true)} packages fetched! ${n.queue.length} left in queue!`);
            }
        });

        console.log(`==========${DateHelper.today}==========`);
        npm.init();
    });
}


async function run() {
    if (pathExistsSync(join(Generator.REPORT_DIR, "pkg-" + DateHelper.today + ".json"))) {
        console.log(`Already fetched for ${DateHelper.today}`);
        return;
    }
    const range = 30;

    // Fetch last 30 days' data
    try {
        await npmJob(range);

        console.log("Fetching finished for!", DateHelper.today);
        // run generator
        // if data pkg not exists, do nothing
        let generator = new Generator(DateHelper.today);
        if (generator.noData) {
            return;
        }
        let needDeployment = !pathExistsSync(join(Generator.REPORT_DIR, "pkg-" + DateHelper.today + ".json"));

        const metaInfo = readJsonSync(join(__dirname, "data/meta.json"));

        // Regenerate all data with this fetch for past two weeks
        let i = 1;
        let startDate = metaInfo.last_generated_date;
        while (new Date(DateHelper.add(startDate, i)) <= new Date(DateHelper.today)) {
            console.log("Generating for: ", DateHelper.add(startDate, i));
            generator.generate(DateHelper.add(startDate, i));
            i++;
        }
        metaInfo.last_generated_date = DateHelper.today;
        writeJsonSync(join(__dirname, "data/meta.json"), metaInfo);

        console.log("Removing old files...");

        // Remove all data except this fetch and last fetch
        let prevDate = DateHelper.add(DateHelper.today, -1);
        while(!pathExistsSync(join(__dirname, "./data/stat-" + prevDate + ".json"))) {
            prevDate = DateHelper.add(prevDate, -1);
        }

        const names = await fsp.readdir(join(__dirname, "./data"));
        for (const name of names) {
            if (name === "404s.json") continue;
            if (name === "meta.json") continue;
            if (name.startsWith(`stat-${DateHelper.today}`)) continue;
            if (name.startsWith(`info-${DateHelper.today}`)) continue;
            if (name.startsWith(`stat-${prevDate}`)) continue;
            if (name.startsWith(`info-${prevDate}`)) continue;
            await fsp.unlink(join(__dirname, "./data", name));
        }

        // do a deployment if report is not exists
        if (needDeployment) {
            console.log("deploying to gh-pages");
            ghPages.publish(join(__dirname, "dist"), {
                add: true,  // only add
                message: `Generating/updating reports on ${DateHelper.today}! [ci skip]`
            }, (error) => {
                console.log("error:", error);
            });
        }

    } catch {}
}


run()