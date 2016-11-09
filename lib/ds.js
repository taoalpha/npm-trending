'use strict';

/**
 * text based DataStore.
 *  - easy to retrieve top n order by <prop>
 *
 *
 * basic flow: read => wash => use(getTop) => write
 *
 *
 * structure:
 *  - data
 *    - {pkg: {stats, fetchTime, updateTime}}
 *  - stats
 *    - {downlaods: {date: count}, dayChange: percentage, weekChange: percentage}
 */

const fs = require('fs');

let dataStore = Object.create(null);
const resolvePath = (obj, path) => {
  path = path.split('.');
  try {
    while (path.length) {
      obj = obj[path[0]];
      path.shift();
    }
    return obj;
  } catch (err) {
    return Math.log(0);
  }
};

module.exports = {
  read(path) {
    try {
      dataStore = JSON.parse(fs.readFileSync(path));
    } catch (err) {}
    module.exports.ds = dataStore;
    return dataStore;
  },
  write(path, data) {
    fs.writeFileSync(path, data ? JSON.stringify(data) : JSON.strinify(dataStore), 'utf8');
  },
  getTop(n, prop) {
    const tops = new Array(n + 1);
    let index = 0;

    // loop over dataStore
    for (const pkgName in dataStore) {
      const pkg = dataStore[pkgName];
      if (index < n) {
        // put top n in the tops
        tops[index] = pkg;
        tops[index].name = pkgName;
        tops[index].createTimePretty = new Date(pkg.createTime).toISOString();
        tops[index].fetchTimePretty = new Date(pkg.fetchTime).toISOString();
      } else {
        // then update smaller one with bigger one
        for (let i = 0; i < n; i++) {
          if (resolvePath(pkg, prop) > resolvePath(tops[i], prop)) {
            tops[i] = pkg;
            tops[i].name = pkgName;
            tops[i].createTimePretty = new Date(pkg.createTime).toISOString();
            tops[i].fetchTimePretty = new Date(pkg.fetchTime).toISOString();
            break;
          }
        }
      }
      index++;
    }

    return tops.sort((a, b) => resolvePath(b, prop) - resolvePath(a, prop));
  },
  wash(data) {
    // calc dayChange, weekChange for all pkgs
    data = data || dataStore;
    for (const pkgName in dataStore) {
      const pkg = dataStore[pkgName];
      const downloads = resolvePath(pkg, 'stats.downloads');
      if (downloads) {
        const d = new Date();
        d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
        const today = d.toISOString().split('T')[0];
        d.setDate(d.getDate() - 1);
        const yesterday = d.toISOString().split('T')[0];
        d.setDate(d.getDate() - 1);
        const preyesterday = d.toISOString().split('T')[0];
        d.setDate(d.getDate() - 5);
        const lastweek = d.toISOString().split('T')[0];
        d.setDate(d.getDate() + 7);
        d.setMonth(d.getMonth() - 1);
        const lastmonth = d.toISOString().split('T')[0];
        try {
          pkg.stats.nowInc = downloads[today] - downloads[yesterday];
          pkg.stats.nowChange = pkg.stats.nowInc / downloads[yesterday];
          pkg.stats.dayInc = downloads[yesterday] - downloads[preyesterday];
          pkg.stats.dayChange = pkg.stats.dayInc / downloads[preyesterday];

          // pkg.stats.weekInc = downloads[yesterday] - downloads[preyesterday];
          // pkg.stats.weekChange = (downloads[today] - downloads[lastweek]) / downloads[lastweek];
          // pkg.stats.dayInc = downloads[yesterday] - downloads[preyesterday];
          // pkg.stats.monthChange = (downloads[today] - downloads[lastmonth]) / downloads[lastmonth];
        } catch (err) {}
      }
    }
    return data;
  }
};
