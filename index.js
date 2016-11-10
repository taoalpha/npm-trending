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

  info(name) {
    // fetching
    if (this.fetchedInfo[name]) return;
    this.fetch('https://registry.npmjs.org/' + name + '/*', (err, data) => {
      if (err) {
        return this.log(err);
      }
      this.fetchedInfo[name] = data;
      this.update('info');
    });
  }

  stat(name) {
    // no repeat fetching
    let fetch = true;
    const d = new Date();
    d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
    const today = d.toISOString().split('T')[0];
    if (this._fetchedData[name]) {
      // if already tried fetched once, no more trials
      fetch = false;
    }

    // for failed pkg, no retry in 7 days
    if (this.fetchedData[name] && this.fetchedData[name].fail && (+d - this.fetchedData[name].fetchTime < 3 * 24 * 3600 * 1000)) {
      fetch = false;
    }

    // for pkg that fetched successful, but no data for today
    // no fetch if last fetchTime is pretty close: < 3 hours
    // so can update today's stat if > 3 hours
    if (this.fetchedData[name] && (+d - this.fetchedData[name].fetchTime < 3 * 3600 * 1000)) {
      fetch = false;
    }

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
        this.fetchedData[name].fail = true;
        return this.log(err);
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
        this.log(name, err);
        this.fetchedData[name].fail = true;
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
    https.get(url, res => {
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
if (args.mode === 'update') {
  console.log(Object.keys(crawler.fetchedData).length);
  Object.keys(crawler.fetchedData).forEach((pkg, i) => {
    if (!crawler.fetchedData.hasOwnProperty(pkg)) return;
    crawler.stat(pkg);
  });
} else if (args.mode === 'info') {
  Object.keys(crawler.fetchedData).forEach((pkg, i) => {
    if (!crawler.fetchedData.hasOwnProperty(pkg)) return;
    if (i > 2000) return;
    crawler.info(pkg);
  });
} else {
  crawler.seed();
}
process.on('exit', function() {
  console.log('new packages fetched: ' + crawler.newCount, 'total packages fetched: ' + crawler.fetchCount);
  process.exit();
});
process.on('SIGINT', function() {
  console.log('new packages fetched: ' + crawler.newCount, 'total packages fetched: ' + crawler.fetchCount);
});

process.on('uncaughtException', function() {
  console.log(arguments);
  process.exit();
});
