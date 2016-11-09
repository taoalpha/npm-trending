'use strict';
/**
 * analyze data, render trending pages.
 * - read data
 * - analyze and get the tops
 * - generate pages based on the tops
 */

const ds = require('./lib/ds');

let dat = ds.read('./data/db.json');
console.log(ds.getTop(10, 'stats.dayInc'));
console.log(ds.getTop(10, 'stats.dayChange'));
console.log(ds.getTop(10, 'stats.nowInc'));
console.log(ds.getTop(10, 'stats.nowChange'));

console.log(ds.getTop(10, 'stats.dayInc').map(v => v.name).join(','));
console.log(ds.getTop(10, 'stats.dayChange').map(v => v.name).join(','));
console.log(ds.getTop(10, 'stats.nowInc').map(v => v.name).join(','));
console.log(ds.getTop(10, 'stats.nowChange').map(v => v.name).join(','));
const d = new Date();
d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
