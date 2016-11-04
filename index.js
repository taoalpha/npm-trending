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

  stat(name) {
    // no repeat fetching
    let fetch = true;
    const d = new Date();
    d.setTime(d.getTime() - (d.getTimezoneOffset() * 60 * 1000));
    const today = d.toISOString().split('T')[0];
    if (this._fetchedData[name] || (this.fetchedData[name] && this.fetchedData[name].stats.downloads[today])) {
      // if already tried fetched once, no more trials
      // if already fetched today's stat, mark as no fetching
      fetch = false;
    }

    // for failed pkg, no retry in 7 days
    if (this.fetchedData[name] && this.fetchedData[name].fail && (+d - this.fetchedData[name].fetchTime < 7 * 24 * 3600 * 1000)) {
      fetch = false;
    }

    // for pkg that fetched successful, but no data for today
    // no fetch if last fetchTime is pretty close: < 3 hours
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
        this._fetchedData[name].fail = true;
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
        this.fetchedData[name].fail = true;
        this.log(name, err);
      }

      this.ds.write('./data/db.json', this.ds.wash(this.fetchedData));
    });
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
}

const crawler = new Crawler();
crawler.seed();

process.on('exit', function() {
  console.log('new packages fetched: ' + crawler.newCount, 'total packages fetched: ' + crawler.fetchCount);
  process.exit();
});
