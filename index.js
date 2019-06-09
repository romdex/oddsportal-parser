const config = require('./config.js');
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const oddsPortalProfile = 'https://www.oddsportal.com/profile/alex8716/my-predictions/next/';

    const oddsPortalLogin = 'https://www.oddsportal.com/login/';
    const oddsPortalUsername = 'romdex';
    const oddsPortalPassword = '1Wdtnghjv';
    const timeZone = 'https://www.oddsportal.com/set-timezone/31/';

    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    // Login
    await page.goto(oddsPortalLogin, {waitUntil: 'networkidle0'});
    // Login data
    await page.type('#login-username1', oddsPortalUsername);
    await page.type('#login-password1', oddsPortalPassword);
    await Promise.all([
        page.click('#col-content > div:nth-child(3) > div > form > div:nth-child(3) > button'),
        page.waitForNavigation({waitUntil: 'networkidle0'})
    ]);
    // Change time zone
    await page.goto(timeZone, {waitUntil: 'networkidle0'});
    // Go to Odds Profile
    await page.goto(oddsPortalProfile, {waitUntil: 'networkidle0'});
    // Check pagination
    const pages = await page.evaluate(() => {
        if (document.querySelector('#pagination')) {
            return document.querySelector('#pagination').lastChild.getAttribute('x-page');
        }
    });

    let result = [];
    for (let i = 2; i <= pages; i++) {
        await page.goto(`https://www.oddsportal.com/profile/alex8716/my-predictions/next/page/${i}/`, {waitUntil: 'networkidle0'});
        const scrappedData = await page.evaluate((config) => {
            const allSportNames = document.querySelectorAll('a.bfl.sicona');
            const allLeagueLocations = document.querySelectorAll('th.first > a:nth-child(3)');
            const allLeagueNames = document.querySelectorAll('th.first > a:nth-child(5)');
            const allEventTimes = document.querySelectorAll('.table-time.center.datet:not(.live-score)');
            const allPlayers = document.querySelectorAll('td.table-participant > strong');
            const allBetTypes = document.querySelectorAll('td.table-participant > a.number2');
            const allPickCells = document.querySelectorAll('tr.pred-usertip');

            let data = [];
            for (let i = 0; i < allEventTimes.length; i++) {
                const sportName = allSportNames[i].textContent;
                const leagueLocation = allLeagueLocations[i].textContent.trim();
                const leagueName = allLeagueNames[i].textContent;
                const [eventDate, eventTime] = allEventTimes[i].innerHTML.split("<br>");
                const [player1, player2] = allPlayers[i].textContent.split("-");
                const qBetType = allBetTypes[i].textContent;
                const pickCells = allPickCells[i].children;

                // Check if it's needed betType
                let betType;
                for (let i = 0; i < config.requiredBetTypes.length; i++) {
                    if (qBetType.includes(config.requiredBetTypes[i])) {
                        betType = qBetType;
                        break;
                    } else {
                        betType = null;
                    }
                }
                if (betType === null) {
                    continue;
                }
                // Check if it's needed sport
                let sportId;
                if (config.requiredSportId[sportName]) {
                    sportId = config.requiredSportId[sportName];
                } else {
                    continue;
                }
                // Format date
                let dateFormat = '';
                if (eventDate === 'Today') {
                    const today = new Date();
                    dateFormat = today.getFullYear() + '-' + `${today.getMonth() + 1}`.padStart(2, 0) + '-' + `${today.getDate()}`.padStart(2, 0) + 'T' + eventTime + ':00T';
                } else if (eventDate === 'Tomorr.') {
                    const today = new Date();
                    const tomorrow = new Date();
                    tomorrow.setDate(today.getDate() + 1);
                    dateFormat = tomorrow.getFullYear() + '-' + `${tomorrow.getMonth() + 1}`.padStart(2, 0) + '-' + `${tomorrow.getDate()}`.padStart(2, 0) + 'T' + eventTime + ':00T';
                } else {
                    const date = new Date();
                    const [eventMonth, eventDay] = eventDate.split('/');
                    dateFormat = date.getFullYear() + '-' + eventMonth + '-' + eventDay + 'T' + eventTime + ':00T';
                }

                // Winner pick
                let pick = [];
                for (let i = 0; i < pickCells.length; i++) {
                    pick.push(null);
                    if (pickCells[i].hasAttribute('xparam')) {
                        pick[i] = pickCells[i].innerText;
                    }
                }
                data.push({
                    "sportId": sportId,
                    "leagueLocation": leagueLocation,
                    "leagueName": leagueName,
                    "eventDate": dateFormat,
                    "player1": player1.trim(),
                    "player2": player2.trim(),
                    "betType": betType,
                    "pick": pick,
                });
            }
            return data;
        }, config);
        if (scrappedData.length) {
            result.push(scrappedData);
        }
    }
    if (result.length) {
        fs.writeFileSync('blabla.json', JSON.stringify(result));
    }
})();