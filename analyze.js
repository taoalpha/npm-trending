'use strict';
/**
 * analyze data, render trending pages.
 * - read data
 * - analyze and get the tops
 * - generate pages based on the tops
 */

const ds = require('./lib/ds');
const helper = require('./lib/helper');
const info = helper.read('./data/info.json');
let dat = ds.read('./data/db.json');
/*
console.log("======== Day Increase Number Top 10 ==========");
console.log(ds.getTop(10, 'stats.dayInc').map(v => {return {name: v.name, description: info[v.name].description, dayInc: v.stats.dayInc}}));
console.log("======== Day Increase Percentage Top 10 ==========");
console.log(ds.getTop(10, 'stats.dayChange').map(v => {return {name: v.name, description: info[v.name].description, dayChange: v.stats.dayChange}}));

console.log("======== Now Increase Number Top 10 ==========");
console.log(ds.getTop(10, 'stats.nowInc').map(v => {return {name: v.name, description: info[v.name].description, nowInc: v.stats.nowInc}}));
console.log("======== Now Increase Percentage Top 10 ==========");
console.log(ds.getTop(10, 'stats.nowChange').map(v => {return {name: v.name, description: info[v.name].description, nowChange: v.stats.nowChange}}));

console.log("======== Fetch Time Bottom 10 ==========");
console.log(ds.getBottom(10, 'fetchTime').map(v => {return {name: v.name, description: info[v.name].description, fetchTime: v.fetchTime, fetchTimePretty: v.fetchTimePretty}}));
console.log("======== Create Time Bottom Top 10 ==========");
console.log(ds.getBottom(10, 'createTime').map(v => {return {name: v.name, description: info[v.name].description, createTime: v.createTime, createTimePretty: v.createTimePretty}}));

*/
// console.log(ds.getTop(10, 'stats.dayInc').map(v => v.name).join(','));
console.log(ds.getTop(5, 'stats.dayChange').map(v => v.name).join(','));
// console.log(ds.getTop(10, 'stats.nowInc').map(v => v.name).join(','));
// console.log(ds.getTop(10, 'stats.nowChange').map(v => v.name).join(','));
const d = new Date();
d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));

console.log(dat.gulp);
