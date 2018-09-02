console.log("Hi");

function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

// the date!
let date = getParameterByName("date") || new Date().toISOString().split("T")[0];

const prettyDate = (date) => {
    return new Date(date).toGMTString().replace(" 00:00:00 GMT", "");
}

const numberUnit = {
    1000: "k",
    1000000: "m"
}
const prettyNumber = (n) => {
    let prefix = n > 0 ? 1 : -1;
    n = Math.abs(n);
    let m = (n / Math.pow(10, 6)).toFixed(2);
    let k = (n / Math.pow(10, 3)).toFixed(2);
    if ( +m > 1) {
        return `${prefix * m}m`; 
    } else if (+k > 1) {
        return `${prefix * k}k`;
    } else {
        return prefix * n;
    }
}

const HEADER_TEMPLATE = data => `
${data.title} @ ${prettyDate(data.date)}
<span>(total : ${data.total})</span>
`;

const renderPkg = (pkg, category) => {
    if (category.id === "inc") {
        return `<span class="fa fa-${pkg.status}"> ${prettyNumber(pkg.inc)} (${(pkg.change * 100).toFixed(2)}%)</span>`;
    } else if (category.id === "change") {
        return `<span class="fa fa-${pkg.status}"> ${(pkg.change * 100).toFixed(2)}% (${prettyNumber(pkg.inc)})</span>`;
    } else {
        return `<span class="fa fa-${pkg.status}"> ${prettyNumber(pkg[category.date])} (${prettyNumber(pkg.inc)})</span>`;
    }
}
// for each column
const COLUMN_TEMPLATE = (category, data) => `
<article>
  <div class="catHeader" style="background-color: #33a1d6;">${category.title} @ ${prettyDate(category.date)}</div>
  ${
    data.map(pkg => `
        <div class="pkgCard">
            <h3 class="pkgTitle">
                <a href="https://www.npmjs.com/package/${pkg.name}">${pkg.name}</a>
                ${renderPkg(pkg, category)}
            </h3>
            <div class="pkgDesc">${pkg.description}</div>
            <div class="pkgInfo">
                <span>
                  ${pkg.author ? `<a href="https://www.npmjs.com/~${pkg.author.name}">` : ""}<i class="fa fa-user"> ${pkg.author && pkg.author.name || "Unknown"}</i>${pkg.author ? "</a>" : ""}
                </span>
                ${pkg.homepage ? `
                <span> 
                  <a href="${pkg.homepage}"><i class="fa fa-link"> homepage</i></a>
                </span>
                ` : ""}
                <span><i class="fa fa-download"> ${prettyNumber(pkg[category.date])} (${category.date})</i></span>
            </div>
            <div class="share"></div>
        </div>
      `)
    }
</article>
`;

const CONTENT_TEMPLATE = data => `
${COLUMN_TEMPLATE({
        id: "top",
        title: "Top Downloads",
        date: data.date
    }, data.dayTop)}
${COLUMN_TEMPLATE({
        id: "inc",
        title: "Top Increase Number",
        date: data.date
    }, data.dayInc)}
${COLUMN_TEMPLATE({
        id: "change",
        title: "Top Increase Percentage",
        date: data.date
    }, data.dayChange)}
`;


function ready(fn) {
    if (document.attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

// by default, go to previous day
let direction = -1;

// render
ready(() => {
    // get the json
    axios.get(`./reports/pkg-${date}.json`)
        .then(function (response) {
            let data = response.data;
            if (!data.dayTop || data.dayTop.length <= 0) goTo();
            // update title
            document.title = `${data.title} @ ${prettyDate(data.date)}`;

            // render header and content
            document.getElementsByTagName("header")[0].innerHTML = HEADER_TEMPLATE(data);
            document.getElementById("content").innerHTML = CONTENT_TEMPLATE(data);
        })
        .catch(function (error) {
            console.log(error);
            goTo();
        });
});

function goTo(d) {
    d = d || direction;
    let newDate = new Date(date);
    newDate.setDate(newDate.getDate() + d);
    if (newDate > Date.now()) return;
    if (newDate <= new Date("2017-03-01")) return;
    document.location = "?date=" + newDate.toISOString().split("T")[0];
}

// left -> previous, right -> next
document.addEventListener("keyup", function (e) {
    if (e.keyCode === 37) {
        // left
        goTo(-1);
        direction = -1;
    } else if (e.keyCode === 39) {
        // right
        goTo(1)
        direction = 1;
    }
});

