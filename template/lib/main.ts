console.log("Hi");

declare let axios: any;
declare let Chartist: any;

import { ChartistStatic } from "Chartist";
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

    static ready(fn: () => void): void {
        if ((document as any).attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    static toggleClass(el, className) {
        if (el.classList.contains(className)) {
            el.classList.remove(className);
        } else {
            el.classList.add(className);
        }
    }


}


class NpmTrending {
    constructor(private data: any) {}

    renderHeader(data: any) {
        return `
<a href="https://github.com/taoalpha/npm-trending/" target="_blank">${data.title}</a> @ ${DateHelper.getDateString(data.date)}
<span class="total-package">(total : ${data.total})</span>
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
            <div class="sparkline" data-pkg="${pkg.name}"></div>
            <div class="pkgInfo">
                <span>
                  ${pkg.author ? `<a target="_blank" href="https://www.npmjs.com/~${pkg.author.name}">` : ""}<i class="fa fa-user"> ${pkg.author && pkg.author.name || "Unknown"}</i>${pkg.author ? "</a>" : ""}
                </span>
                ${pkg.homepage ? `
                <span> 
                  <a href="${pkg.homepage}" target="_blank"><i class="fa fa-link"> homepage</i></a>
                </span>
                ` : ""}
                <span><i class="fa fa-download"> ${Helpers.prettyNumber(pkg[category.date])} (${category.date})</i></span>
            </div>
            <div class="share"></div>
        </div>
      `).join("")
            }
</article>
`;
    }

    renderContent(data) {
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


    drawSparkline(data) {
        let options = {
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
        };

        let renderSparkline = (pkg, cat) => {
            let container = document.querySelector(`.${cat} .sparkline[data-pkg="${pkg.name}"]`);
            if (container) new (Chartist as ChartistStatic).Line(container, {
                labels: this.getPastWeekDate(theDate),
                series: [pkg.history]
            }, options);
        }


        data.dayTop.forEach(pkg => renderSparkline(pkg, "top"));
        data.dayInc.forEach(pkg => renderSparkline(pkg, "inc"));
        data.dayChange.forEach(pkg => renderSparkline(pkg, "change"));
        if (data.dayNew && data.dayNew.length) data.dayNew.forEach(pkg => renderSparkline(pkg, "new"));
    }

    // render modals
    // render new packages modal
    renderNewPackageModal(data) {
        if (!data.dayNew || !data.dayNew.length) return;
        (document.querySelector(".total-package") as HTMLElement).style.cursor = "pointer";
        document.querySelector("#modals .content-container").innerHTML += `<div id="new-package-modal">${this.renderCategory({
            id: "new",
            title: `New Packages Fetched (${data.dayNew.length} added)`,
            date: data.date
        }, data.dayNew, data)}</div>`;
    }

    renderModals(data) {
        this.renderNewPackageModal(data);
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
            // TODO: handle this one better
            if (!data.dayTop || data.dayTop.length <= 0) NpmTrending.goTo();

            // update title
            document.title = `${data.title} @ ${DateHelper.getDateString(data.date)}`;

            let npmTrending = new NpmTrending(data);

            // render header and content
            document.getElementsByTagName("header")[0].innerHTML = npmTrending.renderHeader(data);
            document.getElementById("content").innerHTML = npmTrending.renderContent(data);

            // render modals
            npmTrending.renderModals(data);

            // draw the sparkline
            npmTrending.drawSparkline(data);

            // bind event
            Array.prototype.slice.call(document.querySelectorAll(".pkgTitle")).forEach(el =>
                el.addEventListener("click", () => {
                    let pkgCard = el.parentNode;
                    if (pkgCard.classList.contains("collapse")) pkgCard.classList.remove("collapse");
                    else pkgCard.classList.add("collapse");
                })
            );

            // bind click on total packages 
            // render a modal to show new packages
            // toggle the visibility
            document.querySelector(".total-package").addEventListener("click", () => {
                if (data.dayNew && data.dayNew.length) NpmTrending.toggleModal();
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