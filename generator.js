"use strict";
/**
 * generate pages based on data.
 * - read data
 * - analyze and get the tops
 * - generate pages based on the tops
 */

const Handlebars = require("handlebars");
const fs = require("fs");
const ds = require("./lib/ds");
const helper = require("./lib/helper");
const info = helper.read("./data/info.json");
let dat = ds.read("./data/db.json");

let data = {title: "Npm Trending Report"};

const d = new Date();
d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));

// report will be generated today
let today = d.toISOString().split("T")[0];
data.today = d.toDateString();
data.todayS = today;

// report is based on data most from yesterday and the day before yesterday
// d.setDate(d.getDate() - 1);
// Will generate everyday's report after 5pm PST (which is the end of the day on UTC time)
// so no need to set a day earlier
let reportDay = d.toISOString().split("T")[0];
data.reportDayS = reportDay;
data.reportDay = d.toDateString();

let temp = fs.readFileSync("./template/daily.html", "utf8");
let template = Handlebars.compile(temp);


data.totalPkgs = Object.keys(dat).length;

data.dayIncPkgs = ds.getTop(50, 'stats.dayInc').map(v => {
  let pkgInfo = info[v.name];
  return {
    name: v.name,
    lastday: v.stats.downloads[reportDay],
    description: pkgInfo.description,
    dayInc: v.stats.dayInc, 
    dayChange: (v.stats.dayChange * 100).toFixed(2) + "%",
    homepage: pkgInfo.homepage || (pkgInfo.bugs && pkgInfo.bugs.url && pkgInfo.bugs.url.replace("issues", "")),
    author: pkgInfo._npmUser.name,
    status: v.stats.dayChange > 0 ? "arrow-up" : "arrow-down"
  };
}).filter(v => v.lastday > 100 && v.dayInc > 100);

data.dayChangePkgs = ds.getTop(100, 'stats.dayChange').map(v => {
  let pkgInfo = info[v.name];
  return {
    name: v.name,
    lastday: v.stats.downloads[reportDay],
    description: pkgInfo.description,
    dayInc: v.stats.dayInc, 
    dayChange: (v.stats.dayChange * 100).toFixed(2) + "%",
    homepage: pkgInfo.homepage || (pkgInfo.bugs && pkgInfo.bugs.url && pkgInfo.bugs.url.replace("issues", "")),
    author: (pkgInfo._npmUser && pkgInfo._npmUser.name) || (pkgInfo.author && pkgInfo.author.name) || "unkown",
    status: v.stats.dayChange > 0 ? "arrow-up" : "arrow-down"
  };
}).filter(v => v.lastday > 50);

data.nowPkgs = ds.getTop(10, 'stats.downloads.' + reportDay).map(v => {
  let pkgInfo = info[v.name];
  return {
    name: v.name,
    lastday: v.stats.downloads[reportDay],
    today: v.stats.downloads[today],
    description: pkgInfo.description,
    dayInc: v.stats.dayInc, 
    dayChange: (v.stats.dayChange * 100).toFixed(2) + "%",
    homepage: pkgInfo.homepage || (pkgInfo.bugs && pkgInfo.bugs.url && pkgInfo.bugs.url.replace("issues", "")),
    author: (pkgInfo._npmUser && pkgInfo._npmUser.name) || (pkgInfo.author && pkgInfo.author.name) || "unkown",
    status: v.stats.dayChange > 0 ? "arrow-up" : "arrow-down"
  };
});

let result = template(data);


helper.write(`./dist/${today}.html`, result);
helper.write(`./dist/data/${today}.json`, data);

console.log("Finished");
