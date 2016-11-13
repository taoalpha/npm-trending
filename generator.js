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
const d = new Date();
d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));

let today = d.toISOString().split("T")[0];
d.setDate(d.getDate() - 1);
let lastday = d.toISOString().split("T")[0];
d.setDate(d.getDate() + 1);

let temp = fs.readFileSync("./template/daily.html", "utf8");
let template = Handlebars.compile(temp);


let data = {title: "Npm Trending"};
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
});

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
}).filter(v => v.lastday > 100);

data.today = d.toDateString();

let result = template(data);


helper.write(`./output/${today}.html`, result);

console.log("Finished");
