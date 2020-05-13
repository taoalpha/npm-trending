define("lib/helpers", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DateHelper = void 0;
    var DateHelper = /** @class */ (function () {
        function DateHelper() {
        }
        DateHelper.move = function (date, days) {
            date.setDate(date.getDate() + days);
            return date;
        };
        DateHelper.add = function (date, days) {
            var d = new Date(date);
            d.setDate(d.getDate() + days);
            return d.toISOString().split("T")[0];
        };
        DateHelper.compare = function (dateA, dateB) {
            var dA = new Date(dateA);
            var dB = new Date(dateB);
            if (dA === dB)
                return 0;
            if (dA > dB)
                return 1;
            else
                return -1;
        };
        DateHelper.getDateString = function (date) {
            return new Date(date).toUTCString().replace(" 00:00:00 GMT", "");
        };
        DateHelper.today = new Date().toISOString().split("T")[0];
        return DateHelper;
    }());
    exports.DateHelper = DateHelper;
});
define("dist/lib/main", ["require", "exports", "lib/helpers"], function (require, exports, helpers_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    console.log("Hi");
    var Helpers = /** @class */ (function () {
        function Helpers() {
        }
        Helpers.escapeHtml = function (unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };
        Helpers.getParameterByName = function (name, url) {
            if (url === void 0) { url = window.location.href; }
            name = name.replace(/[\[\]]/g, '\\$&');
            var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'), results = regex.exec(url);
            if (!results)
                return null;
            if (!results[2])
                return '';
            return decodeURIComponent(results[2].replace(/\+/g, ' '));
        };
        Helpers.prettyNumber = function (n) {
            var prefix = n > 0 ? 1 : -1;
            n = Math.abs(n);
            var m = Number((n / Math.pow(10, 6)).toFixed(2));
            var k = Number((n / Math.pow(10, 3)).toFixed(2));
            if (m > 1) {
                return prefix * m + "m";
            }
            else if (k > 1) {
                return prefix * k + "k";
            }
            else {
                return (prefix * n).toString();
            }
        };
        Helpers.maxLengthString = function (str, len) {
            if (str.length < len)
                return Helpers.escapeHtml(str);
            return Helpers.escapeHtml(str.split("").slice(0, len).join("") + "...");
        };
        Helpers.ready = function (fn) {
            if (document.attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
                fn();
            }
            else {
                document.addEventListener('DOMContentLoaded', fn);
            }
        };
        Helpers.toggleClass = function (el, className) {
            if (!el)
                return;
            if (el.classList.contains(className)) {
                el.classList.remove(className);
            }
            else {
                el.classList.add(className);
            }
        };
        Helpers.sanitize = function (str) {
            return str.replace(/"/g, "'");
        };
        return Helpers;
    }());
    var NpmTrending = /** @class */ (function () {
        function NpmTrending(data, date) {
            var _this = this;
            if (date === void 0) { date = helpers_1.DateHelper.today; }
            this.data = data;
            this.date = date;
            this.modals = document.getElementById("modals");
            this.modalContentContainer = document.querySelector("#modals .content-container");
            this.packages = {};
            data.dayTop.forEach(function (pkg) { return _this.packages[pkg.name] = pkg; });
            data.dayChange.forEach(function (pkg) { return _this.packages[pkg.name] = pkg; });
            data.dayInc.forEach(function (pkg) { return _this.packages[pkg.name] = pkg; });
            if (data.dayNew)
                data.dayNew.forEach(function (pkg) { return _this.packages[pkg.name] = pkg; });
        }
        NpmTrending.prototype.renderHeader = function (data) {
            if (data === void 0) { data = this.data; }
            return "\n<a href=\"https://github.com/taoalpha/npm-trending/\" target=\"_blank\">" + data.title + "</a> @ " + helpers_1.DateHelper.getDateString(data.date) + "\n<span class=\"total-package " + (data.dayNew && data.dayNew.length ? "pointer" : "") + "\">(total : " + data.total + ")</span>\n";
        };
        NpmTrending.prototype.renderPkg = function (pkg, category) {
            if (category.id === "dayInc") {
                return "<span class=\"fa fa-" + pkg.status + "\"> " + Helpers.prettyNumber(pkg.inc) + " (" + Helpers.prettyNumber(+((pkg.change * 100).toFixed(2))) + "%)</span>";
            }
            else if (category.id === "dayChange") {
                return "<span class=\"fa fa-" + pkg.status + "\"> " + Helpers.prettyNumber(+(pkg.change * 100).toFixed(2)) + "% (" + Helpers.prettyNumber(pkg.inc) + ")</span>";
            }
            else {
                return "<span class=\"fa fa-" + pkg.status + "\"> " + Helpers.prettyNumber(pkg[category.date]) + " (" + Helpers.prettyNumber(pkg.inc) + ")</span>";
            }
        };
        NpmTrending.prototype.renderAuthor = function (author, category) {
            if (category.id === "dayIncDeveloper") {
                return "<span class=\"fa fa-" + author.status + "\"> " + Helpers.prettyNumber(author.inc) + " (" + Helpers.prettyNumber(+(author.change * 100).toFixed(2)) + "%)</span>";
            }
            else if (category.id === "dayChangeDeveloper") {
                return "<span class=\"fa fa-" + author.status + "\"> " + Helpers.prettyNumber(+(author.change * 100).toFixed(2)) + "% (" + Helpers.prettyNumber(author.inc) + ")</span>";
            }
            else {
                return "<span class=\"fa fa-" + author.status + "\"> " + Helpers.prettyNumber(author.downloads[category.date]) + " (" + Helpers.prettyNumber(author.inc) + ")</span>";
            }
        };
        NpmTrending.prototype.doesShowBefore = function (pkg, category) {
            var data = this.data;
            if (category === "dayTop")
                return false;
            if (category === "dayInc")
                return data.dayTop.some(function (p) { return p.name === pkg.name; });
            if (category === "dayChange")
                return ["dayTop", "dayInc"].some(function (name) { return data[name].some(function (p) { return p.name === pkg.name; }); });
            if (category === "dayDep")
                return ["dayTop", "dayInc", "dayChange"].some(function (name) { return data[name].some(function (p) { return p.name === pkg.name; }); });
            if (category === "dayDevDep")
                return ["dayTop", "dayInc", "dayChange", "dayDep"].some(function (name) { return data[name].some(function (p) { return p.name === pkg.name; }); });
            return false;
        };
        NpmTrending.prototype.doesAuthorShowBefore = function (author, category) {
            var data = this.data;
            if (category === "dayTopDeveloper")
                return false;
            if (category === "dayIncDeveloper")
                return data.dayTopDeveloper.some(function (p) { return p.name === author.name; });
            if (category === "dayChangeDeveloper")
                return ["dayTopDeveloper", "dayIncDeveloper"].some(function (name) { return data[name].some(function (p) { return p.name === author.name; }); });
            return false;
        };
        NpmTrending.prototype.renderCategory = function (category, categoryData) {
            var _this = this;
            return "\n<article class=\"" + category.id + "\">\n    <div class=\"catHeader\" style=\"background-color: #33a1d6;\">" + category.title + " @ " + helpers_1.DateHelper.getDateString(category.date) + "</div>\n    <div class=\"cards\">\n    " + categoryData.map(function (d) {
                return category.id.indexOf("Developer") === -1 ? _this.renderPkgCard(d, category) : _this.renderAuthorCard(d, category);
            }).join("") + "\n    </div>\n</article>\n";
        };
        NpmTrending.prototype.renderPkgCard = function (pkg, category) {
            return "\n        <div data-pkg=\"" + pkg.name + "\" class=\"pkgCard " + (this.doesShowBefore(pkg, category.id) ? "collapse" : "expand") + "\">\n            <h3 class=\"pkgTitle\">\n                <a href=\"https://www.npmjs.com/package/" + pkg.name + "\" target=\"_blank\">" + pkg.name + "</a>\n                " + this.renderPkg(pkg, category) + "\n            </h3>\n            <div class=\"pkgDesc\">" + pkg.description + "</div>\n            <div class=\"sparkline download-history\" data-pkg=\"" + Helpers.sanitize(pkg.name) + "\"></div>\n            <div class=\"pkgInfo\">\n                <span>\n                  " + (pkg.author ? "<a target=\"_blank\" href=\"" + (pkg.author.url ? (pkg.author.url.indexOf("http") !== 0 ? "https://" + pkg.author.url : pkg.author.url) : pkg.author.alias ? "https://www.npmjs.com/~" + pkg.author.alias : "https://www.google.com/search?newwindow=1&q=" + pkg.author.name) + "\">" : "") + "<i class=\"fa fa-user\"> " + Helpers.maxLengthString(pkg.author && (pkg.author.name || pkg.author.alias) || "Unknown", 15) + "</i>" + (pkg.author ? "</a>" : "") + "\n                </span>\n                " + (pkg.homepage ? "\n                <span> \n                  <a href=\"" + pkg.homepage + "\" target=\"_blank\"><i class=\"fa fa-link\"> homepage</i></a>\n                </span>\n                " : "") + "\n                <span><i class=\"fa fa-download\"> " + Helpers.prettyNumber(pkg[category.date]) + "</i></span>\n                " + (pkg.versions && category.id !== "new" ? "<span class=\"fa fa-history pointer\" data-pkg=\"" + Helpers.sanitize(pkg.name) + "\"></span>" : "") + "\n                <span><a href=\"https://www.npmjs.com/browse/depended/" + pkg.name + "\" target=\"_blank\" title=\"" + (pkg.numDependents ? "among all packages we fetched, " + pkg.numDependents + " packages depend on it directly, " + pkg.numDevDependents + " packages depend on it as a development dependency" : "") + "\"><i class=\"fa fa-tree\"> Dep</i></a></span>\n            </div>\n            <div class=\"share\"></div>\n        </div>\n      ";
        };
        NpmTrending.prototype.renderAuthorCard = function (author, category) {
            return "\n        <div data-author=\"" + Helpers.sanitize(author.name) + "\" class=\"authorCard " + (this.doesAuthorShowBefore(author, category.id) ? "collapse" : "expand") + "\">\n            <h3 class=\"authorTitle\">\n                <a target=\"_blank\" href=\"" + (author.url ? (author.url.indexOf("http") !== 0 ? "https://" + author.url : author.url) : author.alias ? "https://www.npmjs.com/~" + author.alias : "https://www.google.com/search?newwindow=1&q=" + author.name) + "\" target=\"_blank\">" + (author.name || author.alias) + " <span class=\"extra\">(" + author.packages.length + " packages)</span></a>\n                " + this.renderAuthor(author, category) + "\n            </h3>\n            <div class=\"sparkline download-history\" data-author=\"" + Helpers.sanitize(author.name) + "\"></div>\n        </div>\n      ";
        };
        NpmTrending.prototype.renderContent = function (data) {
            if (!data.dayTop || !data.dayTop.length) {
                return "<div class=\"empty-data\"><span>No data available for this day, possibly due to data issues in npm registry API.</span></div>";
            }
            var len = Object.keys(data).filter(function (name) { return name !== "dayNew" && name.indexOf("day") === 0 && data[name].length; }).length;
            return "\n<div class=\"col-" + len + "\">\n" + this.renderCategory({
                id: "dayTop",
                title: "Top Downloads",
                date: data.date
            }, data.dayTop) + "\n" + this.renderCategory({
                id: "dayInc",
                title: "Top Increase Number",
                date: data.date
            }, data.dayInc) + "\n" + this.renderCategory({
                id: "dayChange",
                title: "Top Increase Percentage",
                date: data.date
            }, data.dayChange) + "\n" + (data.dayDep ? this.renderCategory({
                id: "dayDep",
                title: "Most Dependents",
                date: data.date
            }, data.dayDep) : "") + "\n" + (data.dayDevDep ? this.renderCategory({
                id: "dayDevDep",
                title: "Most DevDependents",
                date: data.date
            }, data.dayDevDep) : "") + "\n" + (data.dayTopDeveloper ? this.renderCategory({
                id: "dayTopDeveloper",
                title: "Top Developers",
                date: data.date
            }, data.dayTopDeveloper) : "") + "\n" + (data.dayIncDeveloper ? this.renderCategory({
                id: "dayIncDeveloper",
                title: "Top Increase Number Developers",
                date: data.date
            }, data.dayIncDeveloper) : "") + "\n" + (data.dayChangeDeveloper ? this.renderCategory({
                id: "dayChangeDeveloper",
                title: "Top Increase Percentage Developers",
                date: data.date
            }, data.dayChangeDeveloper) : "") + "\n\n</div>\n";
        };
        NpmTrending.prototype.renderVersionHistory = function (pkgName) {
            var pkg = this.packages[pkgName];
            if (!pkg || !pkg.versions)
                return;
            var template = "<div class=\"version-history\">\n                <h2>" + pkg.name + " version history</h2>\n                <div></div>\n            </div>";
            this.modalContentContainer.innerHTML = template;
            // draw version-history
            var keys = Object.keys(pkg.versions).filter(function (key) { return !(key === "created" || key === "modified"); });
            var versionContainer = document.querySelector(".version-history div");
            new Chartist.Line(versionContainer, {
                labels: keys.map(function (key) { return pkg.versions[key]; }),
                series: [keys.map(function (value) {
                        // convert versions into float
                        var parts = value.split(".");
                        return parseFloat(parts[0] + "." + parts.slice(1).join(""));
                    })]
            }, {
                showLine: false,
                axisX: {
                    labelInterpolationFnc: function (value) {
                        var d = new Date(value);
                        return d.getMonth() + 1 + "/" + d.getDate() + "/" + (d.getFullYear() + "").substr(2);
                    }
                },
                axisY: {
                    labelInterpolationFnc: function (value) {
                        // convert it back to version
                        return "v-" + value;
                    }
                }
            });
            // show modal
            NpmTrending.toggleModal();
        };
        NpmTrending.prototype.getPastWeekDate = function (date) {
            var res = [];
            var endDate = new Date(helpers_1.DateHelper.add(date, -7));
            date = new Date(date);
            while (date > endDate) {
                res.unshift(date.toISOString().split("T")[0]);
                helpers_1.DateHelper.move(date, -1);
            }
            return res;
        };
        NpmTrending.prototype.renderSparkline = function (el, pkg) {
            // draw download-history
            if (!el)
                return;
            new Chartist.Line(el, {
                labels: this.getPastWeekDate(this.date),
                series: [pkg.history]
            }, {
                axisX: {
                    labelInterpolationFnc: function (value) {
                        return new Date(value).toUTCString().split(",")[0];
                    }
                },
                axisY: {
                    labelInterpolationFnc: function (value) {
                        return Helpers.prettyNumber(value);
                    }
                }
            });
        };
        NpmTrending.prototype.drawSparkline = function (data) {
            var _this = this;
            var renderSparkline = function (cardData, cat, type) {
                if (type === void 0) { type = "pkg"; }
                // draw download-history
                var container = document.querySelector("." + cat + " .download-history[data-" + type + "=\"" + Helpers.sanitize(cardData.name) + "\"]");
                if (container) {
                    var labels = _this.getPastWeekDate(theDate);
                    var seriesData = void 0;
                    if (type === "author")
                        seriesData = labels.map(function (d) { return cardData.downloads[d] || 0; });
                    else
                        seriesData = cardData.history;
                    new Chartist.Line(container, {
                        labels: labels,
                        series: [seriesData]
                    }, {
                        axisX: {
                            labelInterpolationFnc: function (value) {
                                return new Date(value).toUTCString().split(",")[0];
                            }
                        },
                        axisY: {
                            labelInterpolationFnc: function (value) {
                                return Helpers.prettyNumber(value);
                            }
                        }
                    });
                }
            };
            data.dayTop.forEach(function (pkg) { return renderSparkline(pkg, "dayTop"); });
            data.dayInc.forEach(function (pkg) { return renderSparkline(pkg, "dayInc"); });
            data.dayChange.forEach(function (pkg) { return renderSparkline(pkg, "dayChange"); });
            // dependents data
            if (data.dayDep)
                data.dayDep.forEach(function (pkg) { return renderSparkline(pkg, "dayDep"); });
            if (data.dayDevDep)
                data.dayDevDep.forEach(function (pkg) { return renderSparkline(pkg, "dayDevDep"); });
            // developer's data
            if (data.dayTopDeveloper)
                data.dayTopDeveloper.forEach(function (pkg) { return renderSparkline(pkg, "dayTopDeveloper", "author"); });
            if (data.dayIncDeveloper)
                data.dayIncDeveloper.forEach(function (pkg) { return renderSparkline(pkg, "dayIncDeveloper", "author"); });
            if (data.dayChangeDeveloper)
                data.dayChangeDeveloper.forEach(function (pkg) { return renderSparkline(pkg, "dayChangeDeveloper", "author"); });
        };
        // render modals
        // render new packages modal
        NpmTrending.prototype.renderNewPackage = function (data) {
            var _this = this;
            if (data === void 0) { data = this.data; }
            if (!data.dayNew || !data.dayNew.length)
                return;
            if (this._newPkgColumn) {
                this.modalContentContainer.innerHTML = "";
                this.modalContentContainer.appendChild(this._newPkgColumn);
            }
            else {
                this.modalContentContainer.innerHTML = "<div id=\"new-package-modal\">" + this.renderCategory({
                    id: "new",
                    title: "New Packages Fetched (" + data.dayNew.length + " added)",
                    date: data.date
                }, data.dayNew) + "</div>";
                // draw sparkline and update event binding
                if (data.dayNew && data.dayNew.length)
                    data.dayNew.forEach(function (pkg) {
                        _this.renderSparkline(document.querySelector("#modals .new .download-history[data-pkg=\"" + Helpers.sanitize(pkg.name) + "\"]"), pkg);
                    });
                this._newPkgColumn = document.getElementById("new-package-modal");
                // bind event on new cards
                NpmTrending.bindTitleEvent(document.querySelectorAll("#new-package-modal .pkgTitle"));
            }
            // show modal
            NpmTrending.toggleModal();
        };
        NpmTrending.bindTitleEvent = function (els) {
            // bind event
            Array.prototype.slice.call(els).forEach(function (el) {
                el.addEventListener("click", function () {
                    var pkgCard = el.parentNode;
                    Helpers.toggleClass(pkgCard, "collapse");
                });
                // stopPropagation for child event on links
                if (el.children && el.children[0]) {
                    el.children[0].addEventListener("click", function (e) { return e.stopPropagation(); });
                }
            });
        };
        NpmTrending.goTo = function (d) {
            if (d === void 0) { d = -1; }
            var newDate = helpers_1.DateHelper.add(theDate, d);
            if (new Date(newDate) > new Date()) {
                // set to today
                newDate = helpers_1.DateHelper.getDateString(new Date());
            }
            else if (new Date(newDate) <= new Date("2017-03-01")) {
                // set to 2017-03-01
                newDate = "2017-03-01";
            }
            ;
            document.location.href = "?date=" + newDate;
        };
        NpmTrending.toggleModal = function () {
            Helpers.toggleClass(document.getElementById("modals"), "hide");
        };
        return NpmTrending;
    }());
    // the date, default to today if not set from querystring
    var theDate = Helpers.getParameterByName("date") || helpers_1.DateHelper.add(helpers_1.DateHelper.today, -1);
    if (isNaN(new Date(theDate).getTime()))
        theDate = helpers_1.DateHelper.add(helpers_1.DateHelper.today, -1);
    // fetch data
    Helpers.ready(function () {
        // get the json
        axios.get("./reports/pkg-" + theDate + ".json")
            .then(function (response) {
            var data = response.data;
            var npmTrending = new NpmTrending(data, theDate);
            // render header and content
            document.getElementsByTagName("header")[0].innerHTML = npmTrending.renderHeader(data);
            document.getElementById("content").innerHTML = npmTrending.renderContent(data);
            // update title
            document.title = data.title + " @ " + helpers_1.DateHelper.getDateString(data.date);
            // if no top, no need to render sparkline... since no data will be there
            if (!data.dayTop || data.dayTop.length <= 0) {
                return { prev: {}, cur: data };
            }
            // draw the sparkline
            npmTrending.drawSparkline(data);
            // bind event on all cards in content
            NpmTrending.bindTitleEvent(document.querySelectorAll("#content .pkgTitle"));
            NpmTrending.bindTitleEvent(document.querySelectorAll("#content .authorTitle"));
            // bind click on total packages 
            // render a modal to show new packages
            // toggle the visibility
            document.querySelector(".total-package").addEventListener("click", function () {
                npmTrending.renderNewPackage();
            });
            // bind on history icon
            Array.prototype.slice.call(document.querySelectorAll(".pkgInfo .fa-history")).forEach(function (el) {
                var pkgName = el.getAttribute("data-pkg");
                el.addEventListener("click", function () {
                    npmTrending.renderVersionHistory(pkgName);
                });
            });
            return axios.get("./reports/pkg-" + helpers_1.DateHelper.add(theDate, -1) + ".json")
                .then(function (res) { return ({
                prev: res.data,
                cur: data
            }); });
        })
            .then(function (_a) {
            var prev = _a.prev, cur = _a.cur;
            if (!prev.dayTop || !prev.dayTop.length)
                return;
            if (!cur.dayTop || !cur.dayTop.length)
                return;
            // add NEW icon for packages not in previous day's top
            ["dayTop", "dayChange", "dayInc", "dayDep", "dayDevDep"].forEach(function (category) {
                if (cur[category]) {
                    cur[category].filter(function (pkgC) { return !(prev[category].some(function (pkgP) { return pkgP.name === pkgC.name; })); })
                        .forEach(function (pkg) {
                        Helpers.toggleClass(document.querySelector("." + category + " .pkgCard[data-pkg=\"" + Helpers.sanitize(pkg.name) + "\"]"), "new");
                    });
                }
            });
            ["dayTopDeveloper", "dayChangeDeveloper", "dayIncDeveloper"].forEach(function (category) {
                if (cur[category]) {
                    cur[category].filter(function (authorC) { return !(prev[category] && prev[category].some(function (authorP) { return authorP.name === authorC.name; })); })
                        .forEach(function (author) {
                        try {
                            Helpers.toggleClass(document.querySelector("." + category + " .authorCard[data-author=\"" + Helpers.sanitize(author.name) + "\"]"), "new");
                        }
                        catch (e) { }
                    });
                }
            });
        })
            .catch(function (error) {
            console.log(error);
            // no jump since we allow navigation and default error page
            // NpmTrending.goTo();
        });
    });
    // left -> previous, right -> next
    document.addEventListener("keyup", function (e) {
        if (e.keyCode === 37) {
            // left
            NpmTrending.goTo(-1);
        }
        else if (e.keyCode === 39) {
            if (new Date(theDate) > new Date())
                return;
            // right
            NpmTrending.goTo(1);
        }
    });
    document.querySelector(".navigation .fa-chevron-circle-left").addEventListener("click", function () {
        NpmTrending.goTo(-1);
    });
    document.querySelector(".navigation .fa-chevron-circle-right").addEventListener("click", function () {
        NpmTrending.goTo(1);
    });
    if (+new Date(helpers_1.DateHelper.today) - +new Date(theDate) <= 1000 * 60 * 60 * 24) {
        document.querySelector(".navigation .fa-chevron-circle-right").classList.add("hide");
    }
    ;
    // bind close on modals' close button
    document.querySelector("#modals .fa-close").addEventListener("click", NpmTrending.toggleModal);
});
