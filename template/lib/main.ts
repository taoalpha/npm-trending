console.log("Hi");

declare let axios: any;
declare let Chartist: any;

import { DateHelper } from "../../lib/helpers";

class Helpers {
    static escapeHtml(unsafe: string) {
         return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
    static getParameterByName(name: string, url: string = window.location.href) {
        name = name.replace(/[\[\]]/g, '\\$&');
        const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }
    static prettyNumber(n: number): string {
        let prefix = n > 0 ? 1 : -1;
        n = Math.abs(n);
        let m = Number((n / Math.pow(10, 6)).toFixed(2));
        let k = Number((n / Math.pow(10, 3)).toFixed(2));
        if (m > 1) {
            return `${prefix * m}m`;
        } else if (k > 1) {
            return `${prefix * k}k`;
        } else {
            return (prefix * n).toString();
        }
    }

    static maxLengthString(str: string, len: number): string {
        if (str.length < len) return Helpers.escapeHtml(str);
        return Helpers.escapeHtml(str.split("").slice(0, len).join("") + "...");
    }

    static ready(fn: () => void): void {
        if ((document as any).attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    static toggleClass(el, className) {
        if (!el) return;
        if (el.classList.contains(className)) {
            el.classList.remove(className);
        } else {
            el.classList.add(className);
        }
    }

    static sanitize(str): string {
        return str.replace(/"/g, "'");
    }
}


class NpmTrending {
    private modals = document.getElementById("modals");
    modalContentContainer = document.querySelector("#modals .content-container");
    private packages: any = {};
    private _newPkgColumn: HTMLElement;

    constructor(private data: any, private date: string = DateHelper.today) {
        data.dayTop.forEach(pkg => this.packages[pkg.name] = pkg);
        data.dayChange.forEach(pkg => this.packages[pkg.name] = pkg);
        data.dayInc.forEach(pkg => this.packages[pkg.name] = pkg);
        if (data.dayNew) data.dayNew.forEach(pkg => this.packages[pkg.name] = pkg);
    }

    renderHeader(data: any = this.data) {
        return `
<a href="https://github.com/taoalpha/npm-trending/" target="_blank">${data.title}</a> @ ${DateHelper.getDateString(data.date)}
<span class="total-package ${data.dayNew && data.dayNew.length ? "pointer" : ""}">(total : ${data.total})</span>
`;
    }

    renderPkg(pkg, category) {
        if (category.id === "dayInc") {
            return `<span class="fa fa-${pkg.status}"> ${Helpers.prettyNumber(pkg.inc)} (${Helpers.prettyNumber(+((pkg.change * 100).toFixed(2)))}%)</span>`;
        } else if (category.id === "dayChange") {
            return `<span class="fa fa-${pkg.status}"> ${Helpers.prettyNumber(+(pkg.change * 100).toFixed(2))}% (${Helpers.prettyNumber(pkg.inc)})</span>`;
        } else {
            return `<span class="fa fa-${pkg.status}"> ${Helpers.prettyNumber(pkg[category.date])} (${Helpers.prettyNumber(pkg.inc)})</span>`;
        }
    }

    renderAuthor(author, category) {
        if (category.id === "dayIncDeveloper") {
            return `<span class="fa fa-${author.status}"> ${Helpers.prettyNumber(author.inc)} (${Helpers.prettyNumber(+(author.change * 100).toFixed(2))}%)</span>`;
        } else if (category.id === "dayChangeDeveloper") {
            return `<span class="fa fa-${author.status}"> ${Helpers.prettyNumber(+(author.change * 100).toFixed(2))}% (${Helpers.prettyNumber(author.inc)})</span>`;
        } else {
            return `<span class="fa fa-${author.status}"> ${Helpers.prettyNumber(author.downloads[category.date])} (${Helpers.prettyNumber(author.inc)})</span>`;
        }
    }

    doesShowBefore(pkg, category) {
        let data = this.data;
        if (category === "dayTop") return false;
        if (category === "dayInc") return data.dayTop.some(p => p.name === pkg.name);
        if (category === "dayChange") return ["dayTop", "dayInc"].some(name => data[name].some(p => p.name === pkg.name));
        if (category === "dayDep") return ["dayTop", "dayInc", "dayChange"].some(name => data[name].some(p => p.name === pkg.name));
        if (category === "dayDevDep") return ["dayTop", "dayInc", "dayChange", "dayDep"].some(name => data[name].some(p => p.name === pkg.name));
        return false;
    }

    doesAuthorShowBefore(author, category) {
        let data = this.data;
        if (category === "dayTopDeveloper") return false;
        if (category === "dayIncDeveloper") return data.dayTopDeveloper.some(p => p.name === author.name);
        if (category === "dayChangeDeveloper") return ["dayTopDeveloper", "dayIncDeveloper"].some(name => data[name].some(p => p.name === author.name));
        return false;
    }

    renderCategory(category, categoryData) {
        return `
<article class="${category.id}">
    <div class="catHeader" style="background-color: #33a1d6;">${category.title} @ ${DateHelper.getDateString(category.date)}</div>
    <div class="cards">
    ${categoryData.map(d => {
                return category.id.indexOf("Developer") === -1 ? this.renderPkgCard(d, category) : this.renderAuthorCard(d, category);
            }).join("")}
    </div>
</article>
`;
    }

    renderPkgCard(pkg, category) {
        return `
        <div data-pkg="${pkg.name}" class="pkgCard ${this.doesShowBefore(pkg, category.id) ? "collapse" : "expand"}">
            <h3 class="pkgTitle">
                <a href="https://www.npmjs.com/package/${pkg.name}" target="_blank">${pkg.name}</a>
                ${this.renderPkg(pkg, category)}
            </h3>
            <div class="pkgDesc">${pkg.description}</div>
            <div class="sparkline download-history" data-pkg="${Helpers.sanitize(pkg.name)}"></div>
            <div class="pkgInfo">
                <span>
                  ${pkg.author ? `<a target="_blank" href="${pkg.author.url ? (pkg.author.url.indexOf("http") !== 0 ? `https://${pkg.author.url}` : pkg.author.url) : pkg.author.alias ? `https://www.npmjs.com/~${pkg.author.alias}` : `https://www.google.com/search?newwindow=1&q=${pkg.author.name}`}">` : ""}<i class="fa fa-user"> ${Helpers.maxLengthString(pkg.author && (pkg.author.name || pkg.author.alias) || "Unknown", 15)}</i>${pkg.author ? "</a>" : ""}
                </span>
                ${pkg.homepage ? `
                <span> 
                  <a href="${pkg.homepage}" target="_blank"><i class="fa fa-link"> homepage</i></a>
                </span>
                ` : ""}
                <span><i class="fa fa-download"> ${Helpers.prettyNumber(pkg[category.date])}</i></span>
                ${pkg.versions && category.id !== "new" ? `<span class="fa fa-history pointer" data-pkg="${Helpers.sanitize(pkg.name)}"></span>` : ""}
                <span><a href="https://www.npmjs.com/browse/depended/${pkg.name}" target="_blank" title="${pkg.numDependents ? `among all packages we fetched, ${pkg.numDependents} packages depend on it directly, ${pkg.numDevDependents} packages depend on it as a development dependency` : ""}"><i class="fa fa-tree"> Dep</i></a></span>
            </div>
            <div class="share"></div>
        </div>
      `;
    }

    renderAuthorCard(author, category) {
        return `
        <div data-author="${Helpers.sanitize(author.name)}" class="authorCard ${this.doesAuthorShowBefore(author, category.id) ? "collapse" : "expand"}">
            <h3 class="authorTitle">
                <a target="_blank" href="${author.url ? (author.url.indexOf("http") !== 0 ? `https://${author.url}` : author.url) : author.alias ? `https://www.npmjs.com/~${author.alias}` : `https://www.google.com/search?newwindow=1&q=${author.name}`}" target="_blank">${author.name || author.alias} <span class="extra">(${author.packages.length} packages)</span></a>
                ${this.renderAuthor(author, category)}
            </h3>
            <div class="sparkline download-history" data-author="${Helpers.sanitize(author.name)}"></div>
        </div>
      `;

    }

    renderContent(data) {
        if (!data.dayTop || !data.dayTop.length) {
            return `<div class="empty-data"><span>No data available for this day, possibly due to data issues in npm registry API.</span></div>`;
        }
        let len = Object.keys(data).filter(name => name !== "dayNew" && name.indexOf("day") === 0 && data[name].length).length;
        return `
<div class="col-${len}">
${this.renderCategory({
                id: "dayTop",
                title: "Top Downloads",
                date: data.date
            }, data.dayTop)}
${this.renderCategory({
                id: "dayInc",
                title: "Top Increase Number",
                date: data.date
            }, data.dayInc)}
${this.renderCategory({
                id: "dayChange",
                title: "Top Increase Percentage",
                date: data.date
            }, data.dayChange)}
${data.dayDep ? this.renderCategory({
                id: "dayDep",
                title: "Most Dependents",
                date: data.date
            }, data.dayDep) : ""}
${data.dayDevDep ? this.renderCategory({
                id: "dayDevDep",
                title: "Most DevDependents",
                date: data.date
            }, data.dayDevDep) : ""}
${data.dayTopDeveloper ? this.renderCategory({
                id: "dayTopDeveloper",
                title: "Top Developers",
                date: data.date
            }, data.dayTopDeveloper) : ""}
${data.dayIncDeveloper ? this.renderCategory({
                id: "dayIncDeveloper",
                title: "Top Increase Number Developers",
                date: data.date
            }, data.dayIncDeveloper) : ""}
${data.dayChangeDeveloper ? this.renderCategory({
                id: "dayChangeDeveloper",
                title: "Top Increase Percentage Developers",
                date: data.date
            }, data.dayChangeDeveloper) : ""}

</div>
`;
    }

    renderVersionHistory(pkgName) {
        let pkg = this.packages[pkgName];
        if (!pkg || !pkg.versions) return;

        let template = `<div class="version-history">
                <h2>${pkg.name} version history</h2>
                <div></div>
            </div>`;

        this.modalContentContainer.innerHTML = template;

        // draw version-history
        let keys = Object.keys(pkg.versions).filter(key => !(key === "created" || key === "modified"));

        let versionContainer = document.querySelector(".version-history div");
        new (Chartist as any).Line(versionContainer, {
            labels: keys.map(key => pkg.versions[key]),
            series: [keys.map(value => {
                // convert versions into float
                let parts = value.split(".");
                return parseFloat(parts[0] + "." + parts.slice(1).join(""));
            })]
        }, {
                showLine: false,
                axisX: {
                    labelInterpolationFnc: function (value) {
                        let d = new Date(value);
                        return `${d.getMonth() + 1}/${d.getDate()}/${(d.getFullYear() + "").substr(2)}`;
                    }
                },
                axisY: {
                    labelInterpolationFnc: function (value) {
                        // convert it back to version
                        return "v-" + value
                    }
                }
            });

        // show modal
        NpmTrending.toggleModal();
    }

    getPastWeekDate(date) {
        let res = [];
        let endDate = new Date(DateHelper.add(date, -7));
        date = new Date(date);
        while (date > endDate) {
            res.unshift(date.toISOString().split("T")[0]);
            DateHelper.move(date, -1);
        }

        return res;
    }

    renderSparkline(el, pkg) {
        // draw download-history
        if (!el) return;
        new (Chartist as any).Line(el, {
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
            }
        );
    }

    drawSparkline(data) {
        let renderSparkline = (cardData, cat, type = "pkg") => {
            // draw download-history
            let container = document.querySelector(`.${cat} .download-history[data-${type}="${Helpers.sanitize(cardData.name)}"]`);
            if (container) {
                let labels = this.getPastWeekDate(theDate);
                let seriesData;
                if (type === "author") seriesData = labels.map(d => cardData.downloads[d] || 0);
                else seriesData = cardData.history;
                new (Chartist as any).Line(container, {
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
                    }
                );
            }
        }


        data.dayTop.forEach(pkg => renderSparkline(pkg, "dayTop"));
        data.dayInc.forEach(pkg => renderSparkline(pkg, "dayInc"));
        data.dayChange.forEach(pkg => renderSparkline(pkg, "dayChange"));

        // dependents data
        if (data.dayDep) data.dayDep.forEach(pkg => renderSparkline(pkg, "dayDep"));
        if (data.dayDevDep) data.dayDevDep.forEach(pkg => renderSparkline(pkg, "dayDevDep"));

        // developer's data
        if (data.dayTopDeveloper) data.dayTopDeveloper.forEach(pkg => renderSparkline(pkg, "dayTopDeveloper", "author"));
        if (data.dayIncDeveloper) data.dayIncDeveloper.forEach(pkg => renderSparkline(pkg, "dayIncDeveloper", "author"));
        if (data.dayChangeDeveloper) data.dayChangeDeveloper.forEach(pkg => renderSparkline(pkg, "dayChangeDeveloper", "author"));
    }

    // render modals
    // render new packages modal
    renderNewPackage(data = this.data) {
        if (!data.dayNew || !data.dayNew.length) return;
        if (this._newPkgColumn) {
            this.modalContentContainer.innerHTML = "";
            this.modalContentContainer.appendChild(this._newPkgColumn);
        } else {

            this.modalContentContainer.innerHTML = `<div id="new-package-modal">${this.renderCategory({
                id: "new",
                title: `New Packages Fetched (${data.dayNew.length} added)`,
                date: data.date
            }, data.dayNew)}</div>`;

            // draw sparkline and update event binding
            if (data.dayNew && data.dayNew.length) data.dayNew.forEach(pkg => {
                this.renderSparkline(document.querySelector(`#modals .new .download-history[data-pkg="${Helpers.sanitize(pkg.name)}"]`), pkg);
            });
            this._newPkgColumn = document.getElementById("new-package-modal");

            // bind event on new cards
            NpmTrending.bindTitleEvent(document.querySelectorAll("#new-package-modal .pkgTitle"));
        }

        // show modal
        NpmTrending.toggleModal();
    }

    static bindTitleEvent(els: any) {
        // bind event
        Array.prototype.slice.call(els).forEach(el => {
            el.addEventListener("click", () => {
                let pkgCard = el.parentNode;
                Helpers.toggleClass(pkgCard, "collapse");
            })

            // stopPropagation for child event on links
            if (el.children && el.children[0]) {
                el.children[0].addEventListener("click", e => e.stopPropagation());
            }
        });
    }

    static goTo(d: number = -1) {
        let newDate = DateHelper.add(theDate, d);
        if (new Date(newDate) > new Date()) {
            // set to today
            newDate = DateHelper.getDateString(new Date());
        } else if (new Date(newDate) <= new Date("2017-03-01")) {
            // set to 2017-03-01
            newDate = "2017-03-01";
        };
        document.location.href = "?date=" + newDate;
    }

    static toggleModal() {
        Helpers.toggleClass(document.getElementById("modals"), "hide");
    }
}



// the date, default to today if not set from querystring
let theDate = Helpers.getParameterByName("date") || DateHelper.add(DateHelper.today, -1);

if (isNaN(new Date(theDate).getTime())) theDate = DateHelper.add(DateHelper.today, -1);


// fetch data
Helpers.ready(() => {
    // get the json
    (axios as any).get(`./reports/pkg-${theDate}.json`)
        .then(function (response) {
            let data = response.data;
            let npmTrending = new NpmTrending(data, theDate);

            // render header and content
            document.getElementsByTagName("header")[0].innerHTML = npmTrending.renderHeader(data);
            document.getElementById("content").innerHTML = npmTrending.renderContent(data);

            // update title
            document.title = `${data.title} @ ${DateHelper.getDateString(data.date)}`;

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
            document.querySelector(".total-package").addEventListener("click", () => {
                npmTrending.renderNewPackage();
            });

            // bind on history icon
            Array.prototype.slice.call(document.querySelectorAll(".pkgInfo .fa-history")).forEach(el => {
                let pkgName = el.getAttribute("data-pkg");
                el.addEventListener("click", () => {
                    npmTrending.renderVersionHistory(pkgName);
                });
            });

            return (axios as any).get(`./reports/pkg-${DateHelper.add(theDate, -1)}.json`)
                .then(res => ({
                    prev: res.data,
                    cur: data
                }))
        })
        .then(({ prev, cur }) => {
            if (!prev.dayTop || !prev.dayTop.length) return;
            if (!cur.dayTop || !cur.dayTop.length) return;

            // add NEW icon for packages not in previous day's top
            ["dayTop", "dayChange", "dayInc", "dayDep", "dayDevDep"].forEach(category => {
                if (cur[category]) {
                    cur[category].filter(pkgC => !(prev[category].some(pkgP => pkgP.name === pkgC.name)))
                        .forEach(pkg => {
                            Helpers.toggleClass(document.querySelector(`.${category} .pkgCard[data-pkg="${Helpers.sanitize(pkg.name)}"]`), "new");
                        })
                }
            });
            ["dayTopDeveloper", "dayChangeDeveloper", "dayIncDeveloper"].forEach(category => {
                if (cur[category]) {
                    cur[category].filter(authorC => !(prev[category] && prev[category].some(authorP => authorP.name === authorC.name)))
                        .forEach(author => {
                            try {
                                Helpers.toggleClass(document.querySelector(`.${category} .authorCard[data-author="${Helpers.sanitize(author.name)}"]`), "new");
                            } catch(e) { }
                        })
                }
            })

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
    } else if (e.keyCode === 39) {
        if (new Date(theDate) > new Date()) return;
        // right
        NpmTrending.goTo(1);
    }
});

document.querySelector(".navigation .fa-chevron-circle-left").addEventListener("click", () => {
    NpmTrending.goTo(-1);
});

document.querySelector(".navigation .fa-chevron-circle-right").addEventListener("click", () => {
    NpmTrending.goTo(1);
});


if (+new Date(DateHelper.today) - +new Date(theDate) <= 1000 * 60 * 60 * 24) {
    document.querySelector(".navigation .fa-chevron-circle-right").classList.add("hide");
};

// bind close on modals' close button
document.querySelector("#modals .fa-close").addEventListener("click", NpmTrending.toggleModal);
