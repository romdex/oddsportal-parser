const config = require('./config.js');
const puppeteer = require('puppeteer');
const prompts = require('prompts');
const fs = require('fs');
const api = require('./pinnacle-api');
const beautify = require("json-beautify");


(async () => {
    let userResponse = await prompts(config.userQuestions);
    const profilesForParsing = userResponse.usernameForParsing.split(',');

    debugger;

    for (let i = 0; i < profilesForParsing.length; i++) {
        const oddsPortalProfile = `https://www.oddsportal.com/profile/${profilesForParsing[i].trim()}/my-predictions/next/`;
        const oddsPortalLogin = 'https://www.oddsportal.com/login/';
        const oddsPortalUsername = `${userResponse.oddsPortalUsername}`;
        const oddsPortalPassword = `${userResponse.oddsPortalPassword}`;
        const timeZone = 'https://www.oddsportal.com/set-timezone/31/';

        const browser = await puppeteer.launch({
            headless: false
        });
        const page = await browser.newPage();
        // Login
        await page.goto(oddsPortalLogin, {
            waitUntil: 'domcontentloaded'
        });
        // Login data
        await page.type('#login-username1', oddsPortalUsername);
        await page.type('#login-password1', oddsPortalPassword);
        await Promise.all([
            page.click('#col-content > div:nth-child(3) > div > form > div:nth-child(3) > button'),
            page.waitForNavigation({
                waitUntil: 'domcontentloaded'
            })
        ]);
        // Change time zone if needed
        const timeZoneCheck = await page.evaluate(() => {
            const currentTimeZone = document.querySelector('#user-header-timezone-expander > span');
            return currentTimeZone.textContent.includes('GMT 0');
        });
        if (!timeZoneCheck) {
            await page.goto(timeZone, {
                waitUntil: 'domcontentloaded'
            });
        }
        // Go to Odds Profile
        await page.goto(oddsPortalProfile, {
            waitUntil: 'domcontentloaded'
        });
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
                await page.goto(`${oddsPortalProfile}page/${i}/`, {
                    waitUntil: 'domcontentloaded'
                });
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
                        let sportName = allSportNames[i].textContent;
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
            result = result.flat();
            if (!fs.existsSync('logs')) {
                fs.mkdirSync('logs');
            }
            fs.writeFileSync(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
        }
        console.log(`${profilesForParsing[i].trim()} parsed`);
        ////////////
        //PINNACLE
        ///////////
        let apiResponse = [];
        await result.forEach(elem => {
            api(elem, data => {
                if (data !== null) {
                    apiResponse.push(data);
                }
            });
        });
        await console.log(apiResponse);

        const pinnacleOptions = {
            loginUrl: 'https://beta.pinnacle.com/en/login',
            username: 'AO1051896',
            password: 'Spduf5gy@',
        }
        async function updateBetSize(userResponse, odds) {
            const risk = userResponse.risk;
            const edge = userResponse.edge;
            const bank = userResponse.bank;
            console.log(`bank: ${userResponse.bank}\ncurrent odds: ${odds}`);

            let betSizePercent =
                Math.log10(1 - (1 / (odds / (1 + (edge / 100))))) /
                Math.log10(Math.pow(10, -risk));

            if (isNaN(betSizePercent)) {
                betSizePercent = 0;
            }
            userResponse.bank -= (betSizePercent * bank);
            return (betSizePercent * bank).toFixed(1);
        }

        const placeBet = async (page, odds) => {
            if (parseFloat(odds) >= 1.6) {
                const betAmount = await updateBetSize(userResponse, odds, apiResponse);
                await page.waitForSelector('#stake-field');
                await page.type('#stake-field', betAmount);
                await page.waitForSelector('.place-bets-button');
                await console.log(`READY TO BET ${betAmount} RUB`);
                if (!fs.existsSync('bet-logs')) {
                    fs.mkdirSync('bet-logs');
                }
                if (!fs.existsSync(`bet-logs/${profilesForParsing[i].trim()}.json`)) {
                    fs.writeFileSync(`bet-logs/${profilesForParsing[i].trim()}.json`, beautify(apiResponse, null, 2, 100));
                } else {
                    fs.appendFileSync(`bet-logs/${profilesForParsing[i].trim()}.json`, beautify(apiResponse, null, 2, 100));
                }
            } else {
                await console.log(`odds are lesser than 1.6, skip`);
            }
        }

        await page.goto(pinnacleOptions.loginUrl, {
            waitUntil: 'domcontentloaded'
        });
        // Login
        await page.type('#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(2) > div.loginInput > input', pinnacleOptions.username);
        await page.type('#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(3) > div.loginInput > input', pinnacleOptions.password);
        await Promise.all([
            page.click('#loginButtonContainer > input'),
            page.waitForNavigation({
                waitUntil: 'domcontentloaded'
            }),
        ]);

        for (let n = 0; n < apiResponse.length; n++) {
            await Promise.all([
                page.goto(`https://beta.pinnacle.com/en/Sports/${apiResponse[n].sportId}/Leagues/${apiResponse[n].league}/Events/${apiResponse[n].event}`, {
                    waitUntil: 'networkidle0'
                })
            ]);
            console.log('== CURRENT BET ==');
            console.log(apiResponse[n]);

            if (await page.$('body > div.max-1500.clearfix > div > div.main-content > div > div.middleArea > div > div.main-view > div > ps-not-found-page') === null) {
                console.log(`event bettable`);

                if (apiResponse[n].betType === '1X2') { //actions for 1х2
                    if (await page.$('#moneyline-0') !== null) { //check if possible
                        if (apiResponse[n].pick[0] === 'PICK') {
                            let currentOdds = await page.evaluate(() => {
                                let pinOdds = document.querySelector('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(1) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span').innerText;
                                pinOdds.trim();
                                return pinOdds;
                            });
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(1) > div:nth-child(1)', {
                                delay: 1000
                            });
                            await placeBet(page, currentOdds, apiResponse[n]);
                        } else if (apiResponse[n].pick[1] === 'PICK') {
                            let currentOdds = await page.evaluate(() => {
                                let pinOdds = document.querySelector('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(2) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span').innerText;
                                pinOdds.trim();
                                return pinOdds;
                            });
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(2) > div:nth-child(1)', {
                                delay: 1000
                            });
                            await placeBet(page, currentOdds, apiResponse[n]);
                        } else if (apiResponse[n].pick[2] === 'PICK') {
                            let currentOdds = await page.evaluate(() => {
                                let pinOdds = document.querySelector('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(3) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span').innerText;
                                pinOdds.trim();
                                return pinOdds;
                            });
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(3) > div:nth-child(1)', {
                                delay: 1000
                            });
                            await placeBet(page, currentOdds, apiResponse[n]);
                        } else {
                            throw new Error(`no valid 1X2 pick found`);
                        }
                    } else {
                        console.log('pinnacle does not offer this type of bet');
                    }
                };

                if (apiResponse[n].betType === 'H/A' || apiResponse[n].betType === 'DNB') { //actions for Home Away or Draw No Bet (cheat: its not actually placing H/A or DNB bet, needs changes)
                    if (await page.$('#moneyline-0') !== null) {
                        if (apiResponse[n].pick[0] === 'PICK') {
                            let currentOdds = await page.evaluate(() => {
                                let pinOdds = document.querySelector('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(1) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span').innerText;
                                pinOdds.trim();
                                return pinOdds;
                            });
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(1) > div:nth-child(1)', {
                                delay: 1000
                            });
                            await placeBet(page, currentOdds, apiResponse[n]);
                        } else if (apiResponse[n].pick[1] === 'PICK') {
                            let currentOdds = await page.evaluate(() => {
                                let pinOdds = document.querySelector('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(2) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span').innerText;
                                pinOdds.trim();
                                return pinOdds;
                            });
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(2) > div:nth-child(1)', {
                                delay: 1000
                            });
                            await placeBet(page, currentOdds, apiResponse[n]);
                        } else {
                            console.log(`no valid H/A or DNB pick found`);
                        }
                    }
                };

                if (apiResponse[n].betType.includes('AH')) { //actions for handicap
                    if (await page.$('#handicap-0') !== null) { //check if handicap bet is possible
                        let betValue;
                        let team;

                        if (apiResponse[n].pick[0] === 'PICK') {
                            team = 1;
                        } else {
                            team = 2;
                        }

                        if (apiResponse[n].betType.includes('OT')) { //отрезаем от цифры лишнее
                            betValue = apiResponse[n].betType.slice(2, -4).trim();
                            console.log(`betvalue - _${betValue}_\nteam - ${team}`);
                        } else if (apiResponse[n].betType.includes('Sets')) {
                            betValue = apiResponse[n].betType.slice(2, -4).trim();
                            console.log(`betvalue - _${betValue}_\nteam - ${team}`);
                        } else {
                            betValue = apiResponse[n].betType.substring(2).trim();
                            console.log(`betvalue - _${betValue}_\nteam - ${team}`);
                        }

                        let betBtn = await page.evaluate((betValue, team) => {
                            let hpdValue;
                            for (let i = 1; i < 6; i++) { //#total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(1) > td:nth-child(1) > ps-line > div > div:nth-child(2)
                                console.log(`* looking in:\n #handicap-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`);
                                hpdValue = document.querySelector(`#handicap-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerText;
                                console.log(`found AH bettable value: ${hpdValue}`);
                                if (hpdValue == betValue) {
                                    let hdpOdds = document.querySelector(`#handicap-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(4) > span`).innerText;
                                    let response = {
                                        selector: `#handicap-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`,
                                        odds: hdpOdds.trim(),
                                    }
                                    return response;
                                } else {
                                    console.log('no valid betvalue found');
                                    return `ERR`;
                                }
                            }
                        }, betValue, team);

                        await console.log(betBtn);

                        if (await betBtn !== 'ERR') {
                            await page.click(betBtn.selector, {
                                delay: 500
                            });
                            await console.log('success');
                            await placeBet(page, betBtn.odds, apiResponse[n]);
                        } else {
                            console.log(`pinnacle does not offer bet for ${betValue}`);
                        }
                    } else {
                        console.log(`pinnacle does not offer handicap bet for this match`);
                    }


                }

                if (apiResponse[n].betType.includes('O/U')) { //actions for over under
                    if (await page.$('#total-0') !== null) { //check if o/u bet is possible
                        let betValue;
                        let team;

                        if (apiResponse[n].pick[0] === 'PICK') {
                            team = 1;
                        } else {
                            team = 2;
                        }

                        if (apiResponse[n].betType.includes('OT')) { //отрезаем от цифры лишнее
                            betValue = apiResponse[n].betType.slice(3, -4).trim();
                            console.log(`betvalue - _${betValue}_\nteam - ${team}`);
                        } else if (apiResponse[n].betType.includes('Sets')) {
                            betValue = apiResponse[n].betType.slice(3, -4).trim();
                            console.log(`betvalue - _${betValue}_\nteam - ${team}`);
                        } else {
                            betValue = apiResponse[n].betType.substring(3).trim();
                            console.log(`betvalue - _${betValue}_\nteam - ${team}`);
                        }

                        let betBtn = await page.evaluate((betValue, team) => {
                            let hpdValue;
                            for (let i = 1; i < 6; i++) { //#total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(1) > td:nth-child(1) > ps-line > div > div:nth-child(2)
                                console.log(`* looking in:\n #total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`);
                                hpdValue = document.querySelector(`#total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerText;
                                console.log(`found AH bettable value: ${hpdValue}`);
                                if (hpdValue == betValue) {
                                    let hdpOdds = document.querySelector(`#total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(4) > span`).innerText;
                                    let response = {
                                        selector: `#total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`,
                                        odds: hdpOdds.trim(),
                                    }
                                    return response;
                                } else {
                                    console.log('no valid betvalue found');
                                    return `ERR`;
                                }
                            }
                        }, betValue, team);

                        await console.log(betBtn);

                        if (await betBtn !== 'ERR') {
                            await page.click(betBtn.selector, {
                                delay: 500
                            });
                            await console.log('success');
                            await placeBet(page, betBtn.odds, apiResponse[n]);
                        } else {
                            console.log(`pinnacle does not offer bet for ${betValue}`);
                        }
                    } else {
                        console.log(`pinnacle does not offer over under bet for this match`);
                    }
                }
            } else {
                console.log('event unbettable, skip')
            }
        }
        // await browser.close();
        console.log(`FINISH`);
    }
})();