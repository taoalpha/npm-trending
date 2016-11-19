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
const ProgressBar = require("progress");
const helper = require('./lib/helper');
const args = helper.parseArgs(process.argv.slice(2));

class Crawler {
  constructor() {
    this._PARSE_REG = /\/package\/([\w-]+)/g;
    this._EXPAND_LAYER = 4;
    this.pkgs = new Set();
    this._fetched = {};
    this.ds = ds;
    this._fetchedData = {};
    this.newCount = 0;
    this.fetchCount = 0;
    this.failCount = 0;
    this.writeCount = 0;
    this.fetchedInfo = helper.read('./data/info.json');
    this.fetchedData = this.ds.read('./data/db.json');
    this.backup();
    this.update = helper.debounce(this.update, 5000);
  }

  backup() {
    this.ds.write('./data/db.json.bak', this.ds.wash(this.fetchedData));
    this.ds.write('./data/info.json.bak', this.ds.wash(this.fetchedInfo));
  }

  seed() {
    this.seeds = fs.readFileSync('./seed', 'utf8').split(',').map(v => v.trim());
    this.seeds.forEach(name => {
      this.pkgs.add(name);
      this.expand(name);
    });
  }

  log(msg) {
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

        // crawl the stats and info
        this.stat(match[1]);
        this.info(match[1]);
      }
    });
  }

  info(name, force, callback) {
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

    if (!fetch) {
      if (callback) callback();
      return;
    };

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

      this.update();
      if (callback) callback();
    });
    return;
  }

  stat(name, force, callback) {
    // based on npm download api: https://github.com/npm/download-counts
    // new day's data only available after UTC 12:00
    // so all pkg only needs to be fetched again once after a day
    let fetch = true;
    const d = new Date();
    d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
    const today = d.toISOString().split('T')[0];

    // no repeat fetching
    if (this._fetchedData[name]) {
      // if already tried fetched once, no more trials
      fetch = false;
    }

    // for failed pkgs
    if (this.fetchedData[name] && this.fetchedData[name].fail) {
      // no retry for 7 days if its TypeError (no downloads data)
      if (this.fetchedData[name].fail === "TypeError" && (+d - this.fetchedData[name].fetchTime < 6 * 24 * 3600 * 1000)) {
        fetch = false;

      // retry after 5 mins if its other error
      } else if (+d - this.fetchedData[name].fetchTime < 5 * 60 * 1000) {
        fetch = false
      }
    }

    // no fetch if last successful fetch's fetchTime is pretty close: < 12 hours
    // so can update today's stat if > 12 hours
    if (this.fetchedData[name] && !this.fetchedData[name].fail && (+d - this.fetchedData[name].fetchTime < 20 * 3600 * 1000)) {
     fetch = false;
    }

    // already fetched, fetch a pkg once day
    if (this.fetchedData[name] && this.fetchedData[name].stats.downloads[today]) {
      fetch = false;
    }

    // force fetching
    if (force) fetch = true;

    if (!fetch) {
      if (callback) callback();
      return;
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
      if (callback) callback();
    });
    return;
  }

  update() {
    this.writeCount++;

    // if not specific, write both
    helper.write('./data/info.json', this.fetchedInfo);
    this.ds.write('./data/db.json', this.ds.wash(this.fetchedData));

    // update the seed
    helper.write('./seed', this.ds.getTop(500, 'stats.dayInc').filter(v => Math.random() < 0.1).map(v => v.name).join(',').replace(/"/g, ''));
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
      socket.setTimeout(2000, function() {
        req.end();
      });
    });
  }
}

const crawler = new Crawler();
let keys = Object.keys(crawler.fetchedData);
var bar = new ProgressBar('Updating [:bar] :percent :etas', {
  total: keys.length
});

console.log("Total Packages: " + Object.keys(crawler.fetchedData).length);
if (args.mode === 'update') {
  if (args.name) {
    crawler.stat(args.name, true);
  } else {
    // parallel with args.paral || 30
    let count = 0;
    let callback = function() {
      if (count < keys.length) {
        setTimeout(function(){
          crawler.stat(keys[count], false, callback);
        }, 0)
      }
      count ++;
      bar.tick();
    };
    for (let i = 0; i < (args.paral || 100); i++) {
      setTimeout(function(){
        crawler.stat(keys[count], false, callback);
      }, 0)
      count ++;
    }
  }
} else if (args.mode === 'info') {
  if (args.name) {
    crawler.info(args.name, true);
  } else {
    // parallel with args.paral || 100
    let keys = Object.keys(crawler.fetchedData);
    let count = 0;
    let callback = function() {
      if (count < keys.length) {
        setTimeout(function(){
          crawler.info(keys[count], false, callback);
        }, 0)
      }
      count ++;
      bar.tick();
    };
    for (let i = 0; i < (args.paral || 100); i++) {
      setTimeout(function(){
        crawler.info(keys[count], false, callback);
      }, 0)
      count ++;
    }
  }
} else if (args.mode === "get") {
  if (args.name) {
    console.log(crawler.fetchedData[args.name], crawler.fetchedInfo[args.name]);
  }
} else if (args.mode === "wash") {
  crawler.update();
} else {
  crawler.seed();
}
process.on('exit', function() {
  console.log('new packages fetched: ' + crawler.newCount, 'total packages fetched: ' + crawler.fetchCount, 'total fail fetches: ' + crawler.failCount, 'total write count: ' + crawler.writeCount);
  process.exit();
});
process.on('SIGINT', function() {
  process.exit();
});

process.on('uncaughtException', function() {
  console.log(arguments);
  process.exit();
});
