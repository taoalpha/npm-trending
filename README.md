## npm-trending

will crawl npm packages download stats and generate trending pages every day!!!


### What & Why?

First, npm-trending is a website that will collect the stats about npm packages and then generate a report for top trending packages every day.

I build this because I used github trending a lot, and it helped me find a lot fantastic projects and learned a lot. So I wonder why don't do the same thing for npm packages ? I believe I can find some pretty good packages that I never heard before.

So I build npm-trending, it will generate a daily report around 3am (UTC) to show the current popular projects on npm.

The popularity is calculated based on downloads purely(probably should consider about dependencies too - mark as a TODO).

### How

I used a continuous integration service called circleCI to help me make this daily-trending-report automate. Basically I schedule the crawler script to run every day at 3am UTC to fetch stats, and after it fetched all it can get, it will use the data generate the report for that day.

Here is the status of every build: https://circleci.com/gh/taoalpha/workflows/npm-trending/tree/master

I have to use several jobs with help from circleCI caching to fetch all packages since it takes time to fetch them and circleCI has a limit on free version :(

Based on the update of the npm stats, I will generate report every day. The report will list three categories:

1. Top packages based on the increase of number of downloads from last day;
2. Top packages based on the increase percentage from last day;
3. Top packages with largest downloads today;

[NPM Trending Report](https://taoalpha.github.io/npm-trending/)

Welcome :)


### What next ?

I am currently working on adding more aspects to the popularity calculation and also try to find new ways to detect potential popular packages. And also I am trying to get more from the data I fetched, if you have any good ideas, please don't hesitate and let me know.