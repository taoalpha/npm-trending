## npm-trending

will crawl npm packages download stats and generate trending pages every day!!!


### What & Why?

First, npm-trending is a website that will collect the stats about npm packages and then generate a report for top trending packages every day.

I build this because I used github trending a lot, and it helps me find a lot fantastic projects and learns a lot. So I wonder why don't do the same thing for npm packages ? I believe I can find some pretty good packages that I never heard before.

So I build npm-trending, it will generate a daily report around 5-6pm PST to show the current popular projects on npm.

The popularity is calculated based on downloads purely(probably should consider about dependencies too - mark as a TODO).

### How

I fetched the stats from npm api, and store them into a giant json file (I did not use any DB because I want to host it on github pages and its a purely static website, so use a pure file based storage should be fine and good enough for now).

I have a simple explore system so I can find new packages based their dependencies graph, and fetch them if I find any new one.

Based on the update of the npm stats, I will generate report around 5-6pm PST every day(which is the 00:00 for UTC). The report will list three categories:

1. Top packages based on the increase of number of downloads from last day;
2. Top packages based on the increase percentage from last day;
3. Top packages with largest downloads today;

[NPM Trending Report](https://taoalpha.github.io/npm-trending/)

Welcome :)
