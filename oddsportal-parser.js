const config = require('./config.js');
const puppeteer = require('puppeteer');
const prompts = require('prompts');
const fs = require('fs');
const api = require('./pinnacle-api');
// const request = require('request');

(async () => {
    const userResponse = await prompts(config.userQuestions);
    const profilesForParsing = userResponse.usernameForParsing.split(',');

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

        let result;
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
                result = scrappedData;
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
                    result = scrappedData;
                }
            }
        }

        if (result.length) {
            if (!fs.existsSync('logs')) {
                fs.mkdirSync('logs');
            }
            fs.writeFileSync(`logs/${profilesForParsing[i].trim()}.json`, JSON.stringify(result));
        }
        console.log(`${profilesForParsing[i].trim()} parsed`);
        let apiResponse = [];
        result.forEach(elem => {
            api(elem.player1, elem.player2, elem.sportId, data => {
                apiResponse.push(data);
            });
        });
        console.log(apiResponse);

        const pinnacleOptions = {
            loginUrl: 'https://beta.pinnacle.com/en/login',
            username: 'AO1051896',
            password: 'Spduf5gy@',
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

        console.log(result);
        console.log(apiResponse);
        for (let n = 0; n < apiResponse.length; n++) {
            await page.goto(`https://beta.pinnacle.com/en/Sports/${apiResponse[n].sportId}/Leagues/${apiResponse[n].league}/Events/${apiResponse[n].event}`);
                for (let h = 0; h < result.length; h++) {
                    if (result[h].betType === '1X2') {
                        if (result[h].pick[0] === 'PICK') {
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(1) > div:nth-child(1) > ps-line > div');
                            //TODO placeBet();
                        } else if (result[h].pick[1] === 'PICK') {
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(2) > div:nth-child(1) > ps-line > div');
                            //TODO placeBet();
                        } else if (result[h].pick[2] === 'PICK') {
                            await page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(3) > div:nth-child(1) > ps-line > div');
                            //TODO placeBet();
                        } else {
                            throw new Error(`no valid 1X2 pick found`);
                        }
                    }

                    if (result[h].betType.includes('AH')) {
                        let betValue = result[h].betType.substring(2).trim();
                        let team;

                        if (result[h].pick[0] === 'PICK') {
                            team = 1;
                        } else {
                            team = 2;
                        }
                        
                        let betBtn = await page.evaluate((betValue, team) => {
                            let hpdValue;
                            for (let i = 1; i = 5; i++) {
                                hpdValue = document.querySelector(`#handicap-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerHTML;

                                console.log(`found AH bettable value: ${hpdValue}`);
    
                                if (hpdValue === betValue) {
                                    return `#handicap-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div`;
                                } else {
                                    throw new Error('no valid betvalue found');
                                }
                            }
                        });
                        await page.click(betBtn);
                    }

                    // if (result[h].betType.includes('O/U')) {
                    //     let betValue = result[h].betType.substring(3).trim();
                    //     let ouValue = null;
                    //     let team = null;
                    //     if (result[h].pick[0] === 'PICK') {
                    //         team = 1;
                    //     } else {
                    //         team = 2;
                    //     }

                    //     for (let i = 1; i = 5; i++) {
                    //         ouValue = document.querySelector(`#total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerHTML.substring(4).trim();
                    //         console.log(`found O/U value: ${ouValue}`);
                    //         if (ouValue === betValue) {
                    //             page.click(`#total-0 > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div`);
                    //         }
                    //     }
                    // }

                    // if (result[h].betType === 'DNB') { //TODO зачемто пиннакл присваивает мегауникальный ид контейнеру в зависимости от матча. нужен другой селектор
                    //     if (result[h].pick[0] === 'PICK') {
                    //         page.click('#team-contest-999356459 > ps-game-event-contest > div > table > tbody > tr > td:nth-child(1) > ps-contest-line > div');
                    //         //TODO placeBet();
                    //     } else if (result[h].pick[1] === 'PICK') {
                    //         page.click('#team-contest-999356459 > ps-game-event-contest > div > table > tbody > tr > td:nth-child(2) > ps-contest-line > div');
                    //         //TODO placeBet();
                    //     } else {
                    //         // throw new Error(`no valid DNB pick found`);
                    //     }
                    // }

                    // if (result[h].betType === 'DC') { //TODO такая же хуйня что и DNB
                    //     if (result[h].pick[0] === 'PICK') {
                    //         page.click('#team-contest-1000248867 > ps-game-event-contest > div > table > tbody > tr:nth-child(1) > td:nth-child(1) > ps-contest-line > div');
                    //     } else if (result[h].pick[1] === 'PICK') {
                    //         page.click('#team-contest-1000248867 > ps-game-event-contest > div > table > tbody > tr:nth-child(2) > td:nth-child(1) > ps-contest-line > div');
                    //     } else if (result[h].pick[2] === 'PICK') {
                    //         page.click('#team-contest-1000248867 > ps-game-event-contest > div > table > tbody > tr:nth-child(1) > td:nth-child(2) > ps-contest-line > div');
                    //     }
                    // }

                }
        }






        // await browser.close();
    }
})();