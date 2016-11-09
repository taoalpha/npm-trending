'use strict';
/**
 * helpers
 */

const knife = {
  parseArgs(args) {
    if (!args) return;
    if (typeof args !== "string") args = args.toString();
    const regex = /(\w+)(?:=(\w*))?/g;
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
  }
};

module.exports = knife;
