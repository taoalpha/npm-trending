'use strict';
/**
 * analyze data, render trending pages.
 * - read data
 * - analyze and get the tops
 * - generate pages based on the tops
 */

const ds = require('./lib/ds');

let dat = ds.read('./data/db.json');
console.log(ds.getTop(10, 'stats.dayInc').map(v => {return {name: v.name, dayInc: v.stats.dayInc}}));
console.log(ds.getTop(10, 'stats.dayChange').map(v => {return {name: v.name, dayChange: v.stats.dayChange}}));
console.log(ds.getTop(10, 'stats.nowInc').map(v => {return {name: v.name, nowInc: v.stats.nowInc}}));
console.log(ds.getTop(10, 'stats.nowChange').map(v => {return {name: v.name, nowChange: v.stats.nowChange}}));

console.log(ds.getBottom(10, 'fetchTime').map(v => {return {name: v.name, fetchTime: v.fetchTime, fetchTimePretty: v.fetchTimePretty}}));
console.log(ds.getBottom(10, 'createTime').map(v => {return {name: v.name, createTime: v.createTime, createTimePretty: v.createTimePretty}}));

console.log(ds.getTop(10, 'stats.dayInc').map(v => v.name).join(','));
console.log(ds.getTop(10, 'stats.dayChange').map(v => v.name).join(','));
console.log(ds.getTop(10, 'stats.nowInc').map(v => v.name).join(','));
console.log(ds.getTop(10, 'stats.nowChange').map(v => v.name).join(','));
const d = new Date();
d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
