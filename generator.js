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

// report is based on data most from yesterday and the day before yesterday
d.setDate(d.getDate() - 1);
let reportDay = d.toISOString().split("T")[0];
data.reportDay = d.toDateString();
d.setDate(d.getDate() - 1);
let lastday = d.toISOString().split("T")[0];
data.yesterday = lastday;

let temp = fs.readFileSync("./template/daily.html", "utf8");
let template = Handlebars.compile(temp);


data.dayIncPkgs = ds.getTop(50, 'stats.dayInc').map(v => {
  let pkgInfo = info[v.name];
  return {
    name: v.name,
    lastday: v.stats.downloads[lastday],
    description: pkgInfo.description,
    dayInc: v.stats.dayInc, 
    dayChange: (v.stats.dayChange * 100).toFixed(2) + "%",
    homepage: pkgInfo.homepage || (pkgInfo.bugs && pkgInfo.bugs.url && pkgInfo.bugs.url.replace("issues", "")),
    author: pkgInfo._npmUser.name,
    status: v.stats.dayChange > 0 ? "arrow-up" : "arrow-down"
  };
}).filter(v => v.lastday > 100 && v.dayInc > 100);

data.dayChangePkgs = ds.getTop(50, 'stats.dayChange').map(v => {
  let pkgInfo = info[v.name];
  return {
    name: v.name,
    lastday: v.stats.downloads[lastday],
    description: pkgInfo.description,
    dayInc: v.stats.dayInc, 
    dayChange: (v.stats.dayChange * 100).toFixed(2) + "%",
    homepage: pkgInfo.homepage || (pkgInfo.bugs && pkgInfo.bugs.url && pkgInfo.bugs.url.replace("issues", "")),
    author: (pkgInfo._npmUser && pkgInfo._npmUser.name) || (pkgInfo.author && pkgInfo.author.name) || "unkown",
    status: v.stats.dayChange > 0 ? "arrow-up" : "arrow-down"
  };
}).filter(v => v.lastday > 50);

data.nowPkgs = ds.getTop(200, 'stats.nowChange').map(v => {
  let pkgInfo = info[v.name];
  return {
    name: v.name,
    lastday: v.stats.downloads[reportDay],
    today: v.stats.downloads[today],
    description: pkgInfo.description,
    dayInc: v.stats.dayInc, 
    dayChange: (v.stats.dayChange * 100).toFixed(2) + "%",
    nowInc: v.stats.nowInc, 
    nowChange: (v.stats.nowChange * 100).toFixed(2) + "%",
    homepage: pkgInfo.homepage || (pkgInfo.bugs && pkgInfo.bugs.url && pkgInfo.bugs.url.replace("issues", "")),
    author: (pkgInfo._npmUser && pkgInfo._npmUser.name) || (pkgInfo.author && pkgInfo.author.name) || "unkown",
    status: v.stats.dayChange > 0 ? "arrow-up" : "arrow-down"
  };

  // only show pkg with at least 50 downloads yesterday and nowChange > 10%, nowInc > 50
}).filter(v => v.lastday > 50 && v.nowInc > 50 && parseInt(v.nowChange) > 10);

let result = template(data);


helper.write(`./dist/${today}.html`, result);

console.log("Finished");
