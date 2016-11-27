"use strict";
/**
 * helpers
 */

const fs = require("fs");

const helper = {
  debounce(func, wait, immediate) {
    let timeout;
    return function () {
      const context = this;
      const args = arguments;
      const later = function () {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow)
        func.apply(context, args);
    };
  },

  parseArgs(args) {
    if (!args) return;

    if (typeof args !== "string") args = args.toString();

    const regex = /(\w+)(?:=([\w-.]*))?/g;
    const parsedArgs = {};
    this.getMatches(args, regex, match => {
      parsedArgs[match[1]] = typeof match[2] === "undefined" ? true : match[2];
    });
    return parsedArgs;
  },

  getMatches(str, regex, cb) {
    const matches = [];
    let match = null;
    while ((match = regex.exec(str))) {
      matches.push(match);
      cb(match);
    }
    return matches;
  },

  cleanJSON(path) {
    // clean a json string file into a parsed file
    const data = helper.read(path);
    const parseObj = function (obj) {
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

  // object related
  resolvePath(obj, path) {
    if (!path) return obj;
    path = path.split(".");
    try {
      while (path.length) {
        obj = obj[path[0]];
        path.shift();
      }
      return obj;
    } catch (err) {
      // return Math.log(0);
      return undefined;
    }
  },

  getTop(n, prop, obj) {
    const tops = [];

    // loop over obj
    for (const name in obj) {
      if (!{}.hasOwnProperty.call(obj, name)) continue;
      const o = obj[name];
      if (typeof helper.resolvePath(o, prop) === "undefined") continue;
      if (tops.length < n) {
        // put first n o in the tops
        let no = o;
        no.name = name;
        tops.push(no);
      } else {
        // then update smaller one with bigger one
        tops.sort((a, b) => helper.resolvePath(a, prop) - helper.resolvePath(b, prop));
        for (let i = 0; i < n; i++) {
          if (helper.resolvePath(o, prop) > helper.resolvePath(tops[i], prop)) {
            let no = o;
            no.name = name;
            tops[i] = no;
            break;
          }
        }
      }
    }

    return tops.sort((a, b) => helper.resolvePath(b, prop) - helper.resolvePath(a, prop));
  },

  // file read and write
  read(path) {
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(path));
    } catch (err) {}
    return data;
  },
  write(filepath, content) {
    if (!filepath) return;

    if (!content) content = "";

    if (typeof content === "object")
      content = JSON.stringify(content);

    fs.writeFileSync(filepath, content, "utf8");
  }
};

module.exports = helper;
