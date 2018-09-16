console.log("Hi");

declare let axios: any;
declare let Chartist: any;

import { DateHelper } from "../../lib/helpers";

class Helpers {
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
        if (str.length < len) return str;
        return str.split("").slice(0, len).join("") + "...";
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


}


class NpmTrending {
    private modals = document.getElementById("modals");
    modalContentContainer = document.querySelector("#modals .content-container");
    private packages: any = {};

    constructor(private data: any, private date: string = DateHelper.today) {
        data.dayTop.forEach(pkg => this.packages[pkg.name] = pkg);
        data.dayChange.forEach(pkg => this.packages[pkg.name] = pkg);
        data.dayInc.forEach(pkg => this.packages[pkg.name] = pkg);
        if (data.dayNew) data.dayNew.forEach(pkg => this.packages[pkg.name] = pkg);
    }

    renderHeader(data: any) {
        return `
<a href="https://github.com/taoalpha/npm-trending/" target="_blank">${data.title}</a> @ ${DateHelper.getDateString(data.date)}
<span class="total-package ${data.dayNew && data.dayNew.length ? "pointer" : ""}">(total : ${data.total})</span>
`;
    }

    renderPkg(pkg, category) {
        if (category.id === "inc") {
            return `<span class="fa fa-${pkg.status}"> ${Helpers.prettyNumber(pkg.inc)} (${(pkg.change * 100).toFixed(2)}%)</span>`;
        } else if (category.id === "change") {
            return `<span class="fa fa-${pkg.status}"> ${(pkg.change * 100).toFixed(2)}% (${Helpers.prettyNumber(pkg.inc)})</span>`;
        } else {
            return `<span class="fa fa-${pkg.status}"> ${Helpers.prettyNumber(pkg[category.date])} (${Helpers.prettyNumber(pkg.inc)})</span>`;
        }
    }

    doesShowBefore(pkg, category, data) {
        if (category === "top") return false;
        if (category === "inc") return data.dayTop.some(p => p.name === pkg.name);
        if (category === "change") return data.dayTop.some(p => p.name === pkg.name) || data.dayInc.some(p => p.name === pkg.name);
        return false;
    }

    renderCategory(category, data, _data) {
        return `
<article class="${category.id}">
    <div class="catHeader" style="background-color: #33a1d6;">${category.title} @ ${DateHelper.getDateString(category.date)}</div>
    ${
            data.map(pkg => `
        <div class="pkgCard ${this.doesShowBefore(pkg, category.id, _data) ? "collapse" : "expand"}">
            <h3 class="pkgTitle">
                <a href="https://www.npmjs.com/package/${pkg.name}" target="_blank">${pkg.name}</a>
                ${this.renderPkg(pkg, category)}
            </h3>
            <div class="pkgDesc">${pkg.description}</div>
            <div class="sparkline download-history" data-pkg="${pkg.name}"></div>
            <div class="pkgInfo">
                <span>
                  ${pkg.author ? `<a target="_blank" href="https://www.npmjs.com/~${pkg.author.name}">` : ""}<i class="fa fa-user"> ${Helpers.maxLengthString(pkg.author && pkg.author.name || "Unknown", 15)}</i>${pkg.author ? "</a>" : ""}
                </span>
                ${pkg.homepage ? `
                <span> 
                  <a href="${pkg.homepage}" target="_blank"><i class="fa fa-link"> homepage</i></a>
                </span>
                ` : ""}
                <span><i class="fa fa-download"> ${Helpers.prettyNumber(pkg[category.date])}</i></span>
                ${pkg.versions && category.id !== "new" ? `<span class="fa fa-history pointer" data-pkg="${pkg.name}"></span>` : ""}
                <span><a href="https://www.npmjs.com/browse/depended/${pkg.name}" target="_blank"><i class="fa fa-tree"> Dep</i></a></span>
            </div>
            <div class="share"></div>
        </div>
      `).join("")
            }
</article>
`;
    }

    renderContent(data) {
        if (!data.dayTop || !data.dayTop.length) {
            return `<div class="empty-data"><span>No data available for this day, possibly due to data issues in npm registry API.</span></div>`;
        }
        return `
${this.renderCategory({
                id: "top",
                title: "Top Downloads",
                date: data.date
            }, data.dayTop, data)}
${this.renderCategory({
                id: "inc",
                title: "Top Increase Number",
                date: data.date
            }, data.dayInc, data)}
${this.renderCategory({
                id: "change",
                title: "Top Increase Percentage",
                date: data.date
            }, data.dayChange, data)}
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
        if (!el) return ;
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

        let renderSparkline = (pkg, cat) => {
            // draw download-history
            let container = document.querySelector(`.${cat} .download-history[data-pkg="${pkg.name}"]`);
            if (container) new (Chartist as any).Line(container, {
                labels: this.getPastWeekDate(theDate),
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


        data.dayTop.forEach(pkg => renderSparkline(pkg, "top"));
        data.dayInc.forEach(pkg => renderSparkline(pkg, "inc"));
        data.dayChange.forEach(pkg => renderSparkline(pkg, "change"));
    }

    // render modals
    // render new packages modal
    renderNewPackage(data = this.data) {
        if (!data.dayNew || !data.dayNew.length) return;
        this.modalContentContainer.innerHTML = `<div id="new-package-modal">${this.renderCategory({
            id: "new",
            title: `New Packages Fetched (${data.dayNew.length} added)`,
            date: data.date
        }, data.dayNew, data)}</div>`;

        // draw sparkline and update event binding
        if (data.dayNew && data.dayNew.length) data.dayNew.forEach(pkg => {
            this.renderSparkline(document.querySelector(`#modals .new .download-history[data-pkg="${pkg.name}"]`), pkg);
        });

        // show modal
        NpmTrending.toggleModal();

        // bind event on new cards
        NpmTrending.bindTitleEvent(document.querySelectorAll("#new-package-modal .pkgTitle"));
    }

    static bindTitleEvent(els: any) {
        // bind event
        Array.prototype.slice.call(els).forEach(el =>
            el.addEventListener("click", () => {
                let pkgCard = el.parentNode;
                Helpers.toggleClass(pkgCard, "collapse");
            })
        );
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
let theDate = Helpers.getParameterByName("date") || DateHelper.today;

if (isNaN(new Date(theDate).getTime())) theDate = DateHelper.today;

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
                return;
            }

            // draw the sparkline
            npmTrending.drawSparkline(data);

            // bind event on all cards in content
            NpmTrending.bindTitleEvent(document.querySelectorAll("#content .pkgTitle"));

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
        })
        .catch(function (error) {
            console.log(error);
            NpmTrending.goTo();
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