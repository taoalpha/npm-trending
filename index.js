'use strict';

/**
 * find trending npm packages.
 *
 * Basic idea:
 *  - start fetching from seeds (get names of the packages)
 *  - fetching downloads from stats api (https://api.npmjs.org/downloads/range/{period}/{package})
 *  - update seed with random packages
 *
 */

const fs = require('fs');
const https = require('https');
const process = require('process');
const ds = require('./lib/ds');
const helper = require('./lib/helper');
const args = helper.parseArgs(process.argv.slice(2));

class Crawler {
  constructor() {
    this._PARSE_REG = /\/package\/([\w-]+)/g;
    this._EXPAND_LAYER = 1;
    this.pkgs = new Set();
    this._fetched = {};
    this.ds = ds;
    this.fetchedData = this.ds.read('./data/db.json');
    this._fetchedData = {};
    this.newCount = 0;
    this.fetchCount = 0;
    this.failCount = 0;
    this.fetchedInfo = helper.read('./data/info.json');
    this.backup();
    this.update = this.debounce(this.update, 1000);
  }

  backup() {
    this.ds.write('./data/db.json.bak', this.ds.wash(this.fetchedData));
  }

  seed() {
    this.seeds = fs.readFileSync('./seed', 'utf8').split(',').map(v => v.trim());
    this.seeds.forEach(name => {
      this.pkgs.add(name);
      this.expand(name);
    });
  }

  log(msg) {
    if (msg !== 'fetched') {
      console.log.apply(console, arguments);
    }
    return msg;
  }

  expand(name, layer = 0) {
    // no repeat fetching
    // no expand on expanded pkg?  || this.fetchedData[name].expanded
    if (this._fetched[name]) {
      this.log('fetched');
      return;
    }

    // fetch within the limit
    if (layer > this._EXPAND_LAYER) {
      return;
    }
    this._fetched[name] = true; // mark package as fetched

    // fetching
    this.fetch('https://www.npmjs.com/package/' + name, (err, data) => {
      if (err) {
        return this.log(err);
      }
      let match;
      while ((match = this._PARSE_REG.exec(data))) {
        this.pkgs.add(match[1]);
        this.expand(match[1], layer + 1);
        this.stat(match[1]);
      }
    });
  }

  info(name, force) {
    // no repeat fetching
    let fetch = true;
    const d = new Date();
    d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
    const today = d.toISOString().split('T')[0];

    // for failed pkgs
    if (this.fetchedInfo[name] && this.fetchedInfo[name].fail) {
      // no retry for 7 days if its TypeError (no downloads data)
      if (this.fetchedInfo[name].fail === "TypeError" && (+d - this.fetchedInfo[name].fetchTime < 6 * 24 * 3600 * 1000)) {
        fetch = false;

      // no retry for 10 mins if its syntax error
      } else if (this.fetchedInfo[name].fail === "SyntaxError" && (+d - this.fetchedInfo[name].fetchTime < 10 * 60 * 1000)) {
        fetch = false
      }
    }

    // if no failure 
    // no fetch if current time - last fetch time < expected next update time
    if (this.fetchedInfo[name] && !this.fetchedInfo[name].fail && (+d - this.fetchedInfo[name].fetchTime < this.fetchedInfo[name].nextUpdate)) {
      fetch = false;
    }

    // force fetching
    if (force) fetch = true;

    if (!fetch) return;

    if (!this.fetchedInfo[name]) {
      this.newCount++;
    }

    this.fetchedInfo[name] = this.fetchedInfo[name] || {
      fetchTime: +d,
      createTime: +d,
      nextUpdate: 7 * 24 * 3600 * 1000
    };

    // update fetchTime
    this.fetchedInfo[name].fetchTime = +d;

 
    // fetching
    this.fetch('https://registry.npmjs.org/' + name + '/*', (err, data) => {
      if (err) {
        this.fetchedInfo[name].fail = true;
        this.failCount++;
        return this.log(name, err);
      }

      this.fetchCount++;

      try {
        // mark as success by default
        this.fetchedInfo[name].fail = false;
        data = JSON.parse(data);

        // update if detect a version change
        // by default update every week
        // if no updates, punish it, otherwise reward it
        if (data.version !== this.fetchedInfo.version) {
          Object.assign(this.fetchedInfo[name], data);
          // min nextUpdate time: a day
          this.fetchedInfo[name].nextUpdate = Math.max(this.fetchedInfo[name].nextUpdate / 2, 24 * 3600 * 1000);
        } else {
          // max nextUpdate time: a year
          this.fetchedInfo[name].nextUpdate = Math.min(this.fetchedInfo[name].nextUpdate * 2, 52 * 7 * 24 * 3600 * 1000);
        }
      } catch (err) {
        this.failCount++;
        this.log(name, err.name, data);
        this.fetchedInfo[name].fail = err.name || true; 
      }

      this.update("info");
    });
  }

  stat(name, force) {
    // no repeat fetching
    let fetch = true;
    const d = new Date();
    d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
    const today = d.toISOString().split('T')[0];
    if (this._fetchedData[name]) {
      // if already tried fetched once, no more trials
      fetch = false;
    }

    // for failed pkgs
    if (this.fetchedData[name] && this.fetchedData[name].fail) {
      // no retry for 7 days if its TypeError (no downloads data)
      if (this.fetchedData[name].fail === "TypeError" && (+d - this.fetchedData[name].fetchTime < 6 * 24 * 3600 * 1000)) {
        fetch = false;

      // no retry for 10 mins if its syntax error
      } else if (this.fetchedData[name].fail === "SyntaxError" && (+d - this.fetchedData[name].fetchTime < 10 * 60 * 1000)) {
        fetch = false
      }
    }

    // no fetch if last fetchTime is pretty close: < 3 hours
    // so can update today's stat if > 3 hours
    if (this.fetchedData[name] && (+d - this.fetchedData[name].fetchTime < 3 * 3600 * 1000)) {
      fetch = false;
    }

    // force fetching
    if (force) fetch = true;

    if (!fetch) return;

    if (!this.fetchedData[name]) {
      this.newCount++;
    }

    this.fetchedData[name] = this.fetchedData[name] || {
      fetchTime: +d,
      createTime: +d,
      stats: {
        downloads: {}
      }
    };

    // update fetchTime
    this.fetchedData[name].fetchTime = +d;

    this.fetch('https://api.npmjs.org/downloads/range/last-week/' + name, (err, data) => {
      if (err) {
        this.failCount++;
        this.fetchedData[name].fail = true;
        return this.log(name, err);
      }

      this.fetchCount++;

      try {
        // mark as success by default
        this.fetchedData[name].fail = false;

        // mark the pkg as fetched, so no more fetch this round
        this._fetchedData[name] = true;
        data = JSON.parse(data);
        const downloads = this.fetchedData[name].stats.downloads;
        data.downloads.forEach(d => {
          downloads[d.day] = d.downloads;
        });
      } catch (err) {
        this.failCount++;
        this.log(name, err.name, data);
        this.fetchedData[name].fail = err.name || true; 
      }

      this.update();
    });
  }

  update(mode) {
    if (mode == 'info') {
      helper.write('./data/info.json', this.fetchedInfo);
      return;
    }
    this.ds.write('./data/db.json', this.ds.wash(this.fetchedData));

    // update the seed
    helper.write('./seed', this.ds.getTop(100, 'stats.dayInc').filter(v => Math.random() < 0.03).map(v => v.name).join(',').replace(/"/g, ''));
  }

  fetch(url, done) {
    let req = https.get(url, res => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        done(null, body);
      });
    }).on('error', e => {
      done(e);
    });

    req.on('socket', function (socket) {
      socket.setTimeout(5000, function() {
        req.end();
      });
    });
  }

  debounce(func, wait, immediate) {
    let timeout;
    return function() {
      let context = this, args = arguments;
      let later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      let callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  }
}

const crawler = new Crawler();
console.log("Total Packages: " + Object.keys(crawler.fetchedData).length);
if (args.mode === 'update') {
  if (args.name) {
      crawler.stat(args.name, true);
  } else {
    Object.keys(crawler.fetchedData).forEach((pkg, i) => {
      if (!crawler.fetchedData.hasOwnProperty(pkg)) return;
      if (args.break && i > args.break) return;
      if (args.skip && i < args.skip) return;

      crawler.stat(pkg);
    });
  }
} else if (args.mode === 'info') {
  if (args.name) {
      crawler.info(args.name, true);
  } else {
    Object.keys(crawler.fetchedData).forEach((pkg, i) => {
      if (!crawler.fetchedData.hasOwnProperty(pkg)) return;
      if (args.break && i > args.break) return;
      if (args.skip && i < args.skip) return;
      crawler.info(pkg);
    });
  }
} else {
  crawler.seed();
}
process.on('exit', function() {
  console.log('new packages fetched: ' + crawler.newCount, 'total packages fetched: ' + crawler.fetchCount, 'total fail fetches: ' + crawler.failCount);
  process.exit();
});
process.on('SIGINT', function() {
  console.log('new packages fetched: ' + crawler.newCount, 'total packages fetched: ' + crawler.fetchCount, 'total fail fetches: ' + crawler.failCount);
  process.exit();
});

process.on('uncaughtException', function() {
  console.log(arguments);
  process.exit();
});
