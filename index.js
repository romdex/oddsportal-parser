const config = require('./config.js');
const puppeteer = require('puppeteer');
const prompts = require('prompts');
const fs = require('fs');

(async () => {
    const userResponse = await prompts(config.userQuestions);
    const profilesForParsing = userResponse.usernameForParsing.split(',');

    for (let i = 0; i < profilesForParsing.length; i++) {
        const oddsPortalProfile = `https://www.oddsportal.com/profile/${profilesForParsing[i].trim()}/my-predictions/next/`;
        const oddsPortalLogin = 'https://www.oddsportal.com/login/';
        const oddsPortalUsername = `${userResponse.oddsPortalUsername}`;
        const oddsPortalPassword = `${userResponse.oddsPortalPassword}`;
        const timeZone = 'https://www.oddsportal.com/set-timezone/31/';

        const browser = await puppeteer.launch({headless: false});
        const page = await browser.newPage();
        // Login
        await page.goto(oddsPortalLogin, {waitUntil: 'domcontentloaded'});
        // Login data
        await page.type('#login-username1', oddsPortalUsername);
        await page.type('#login-password1', oddsPortalPassword);
        await Promise.all([
            page.click('#col-content > div:nth-child(3) > div > form > div:nth-child(3) > button'),
            page.waitForNavigation({waitUntil: 'domcontentloaded'})
        ]);
        // Change time zone if needed
        const timeZoneCheck = await page.evaluate(() => {
            const currentTimeZone = document.querySelector('#user-header-timezone-expander > span');
            return currentTimeZone.textContent.includes('GMT 0');
        });
        if (!timeZoneCheck) {
            await page.goto(timeZone, {waitUntil: 'domcontentloaded'});
        }
        // Go to Odds Profile
        await page.goto(oddsPortalProfile, {waitUntil: 'domcontentloaded'});
        // Check pagination
        const pages = await page.evaluate(() => {
            if (document.querySelector('#pagination')) {
                return document.querySelector('#pagination').lastChild.getAttribute('x-page');
            }
        });

        let result = [];
        if (pages === undefined) {
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
        } else {
            for (let i = 1; i <= pages; i++) {
                await page.goto(`${oddsPortalProfile}page/${i}/`, {waitUntil: 'domcontentloaded'});
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
        }

        if (result.length) {
            if (!fs.existsSync('logs')){
                fs.mkdirSync('logs');
            }
            fs.writeFileSync(`logs/${profilesForParsing[i].trim()}.json`, JSON.stringify(result));
        }
        console.log(`${profilesForParsing[i].trim()} parsed`);
        await browser.close();
    }
})();