'use strict';
/**
 * helpers
 */

const fs = require('fs');

const knife = {
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
  },

  parseArgs(args) {
    if (!args) return;
    if (typeof args !== "string") args = args.toString();
    const regex = /(\w+)(?:=([\w-]*))?/g;
    let parsedArgs = {};
    this.getMatches(args, regex, (match) => {
      parsedArgs[match[1]] = typeof match[2] === "undefined" ? true : match[2];
    });
    return parsedArgs;
  },

  getMatches(str, regex, cb) {
    let matches = [];
    let match;
    while(match = regex.exec(str)) {
      matches.push(match);
      cb(match);
    };
    return matches;
  },

  cleanJSON(path) {
    // clean a json string file into a parsed file
    let data = helper.read(path);
    let parseObj = function(obj) {
      Object.keys(obj).forEach(key => {
        try {
          obj[key] = JSON.parse(obj[key]);
          parseObj(obj[key]);
        } catch (err) {}
      });
    };
    parseObj(data);

    helper.write(path, data);
  },

  read(path) {
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(path));
    } catch (err) {}
    return data;
  },
  write(filepath, content) {
    if (!filepath) return;
    if (!content) content = '';
    if (typeof content == "object") content = JSON.stringify(content);
    fs.writeFileSync(filepath, content, 'utf8');
  }
};

module.exports = knife;
