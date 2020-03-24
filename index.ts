import * as Promise from 'bluebird';
import { NpmTrending } from "./lib/fetcher";
import { EndEventRest } from "./lib/types";
import { DateHelper } from "./lib/helpers";
import { pathExistsSync } from "fs-extra";
import { Generator } from "./lib/generator";
import { join } from "path";
import * as ghPages from "gh-pages";

// NpmTrending.TIME_OUT = 1 * 1000;
// NpmTrending.MAX_NUM_PACKAGES = 100;

const npmJob = (date: string = DateHelper.today) : Promise<any> => {
    let promise = new Promise<NpmTrending>((resolve, reject) => {

        let npm = new NpmTrending(date);

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
            // let stats = Object.keys(n.fetched).reduce((prev, cur) => {
            //     prev[n.fetched[cur]] = prev[n.fetched[cur]] || 0;
            //     prev[n.fetched[cur]]++;
            //     return prev;
            // }, {});

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
            } else {
                // if error, or just finish this day's job, then don't continue to next
                reject(rest.error);
            }

        });

        npm.on("fetchBatch", (n: NpmTrending) => {
            // DEBUG - see how fast the queue can go
            if ((n.total(true)) % 100 === 0) {
                console.log(`${n.total(true)} packages fetched! ${n.queue.length} left in queue!`);
            }
        });

        console.log(`==========${date}==========`);
        npm.init();
    });

    return promise.then(npm => {
        return new Promise<any>((resolve, reject) => {

            // run generator
            // if data pkg not exists, do nothing
            let generator = new Generator(date);
            let needDeployment = !pathExistsSync(join(Generator.REPORT_DIR, "pkg-" + date + ".json"));
            generator.generate(DateHelper.add(date, -1));

            // and re-generate the next valid date's data
            if (!generator.noData && DateHelper.compare(date, DateHelper.today) === -1) {
                // re-generate the next valid date
                needDeployment = true;
                let generator = new Generator(DateHelper.add(date, 1));
                while (!generator.noData && DateHelper.compare(generator.date, DateHelper.today) === -1) {
                    generator = new Generator(DateHelper.add(generator.date, 1));
                }
                generator.generate();
            }

            // do a deployment if report is not exists
            if (needDeployment) ghPages.publish(join(__dirname, "dist"), {
                    add: true,  // only add
                    message: `daily report for ${DateHelper.add(date, -1)}! [ci skip]`
                }, (error) => {
                    if (error) reject(error);
                    else resolve({fetched: !generator.noData});
                });
            else resolve({fetched: !generator.noData});
        })
    });
}

// TODO(taoalpha): should always start from last day that moved to data-archive
let start = "2019-11-02";
let i = 0;
let promise;

while (new Date(DateHelper.add(start, i++)) <= new Date(DateHelper.today)) {
    ((i) => {
        if (!pathExistsSync(join(NpmTrending.DATA_DIR, NpmTrending.INFO_DB_PREFIX(DateHelper.add(start, i - 1)) + ".json"))) {
            if (promise) promise = promise.then(res => {
                // don't continue to next date if last fetch finished with valid fetching
                // TODO: should move message out of the fetcher to prevent message overwritten
                // also should update circleCI no output timeout if we allow fetch next day immediately after this day finished
                if (!res.fetched) return npmJob(DateHelper.add(start, i - 1))
                else return {fetched: true};
            });
            else promise = npmJob(DateHelper.add(start, i - 1));

            // ignore any rejections
            promise.catch(console.log);
        }
    })(i)
}
