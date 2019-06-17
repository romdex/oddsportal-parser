const config = require('../config.js');
const prompts = require('prompts');
const fsp = require('fs').promises;
const beautify = require("json-beautify");
const {
    parsingData,
    askPinnacle
} = require('./functions.js');
const puppeteer = require('puppeteer');
const json2xls = require('json2xls');

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
            } else {
                return false;
            }
        });

        let result = [];
        if (pages === false) {
            await parsingData(page, config, result);
        } else {
            for (let i = 1; i <= pages; i++) {
                await page.goto(`${oddsPortalProfile}page/${i}/`, {
                    waitUntil: 'domcontentloaded'
                });
                await parsingData(page, config, result);
            }
        }

        if (result.length) {
            result = await result.flat();
            const xls = await json2xls(result);
            try {
                await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.xlsx`, xls, 'binary');
                // await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
            } catch (e) {
                if (e.code === 'ENOENT') {
                    await fsp.mkdir('logs');
                    await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.xlsx`, xls, 'binary');
                    // await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
                } else {
                    console.error(e);
                }
            }
        }
        console.log(`${profilesForParsing[i].trim()} parsed`);

        ////////////
        //PINNACLE//
        ////////////

        //ask api for IDs
        let apiResponse = [];
        await result.forEach(elem => {
            askPinnacle(elem, data => {
                if (data !== null) {
                    apiResponse.push(data);
                }
            });
        });
        await console.log(apiResponse);

        const pinnacle = {
            loginUrl: 'https://beta.pinnacle.com/en/login',
            username: 'AO1051896',
            password: 'Spduf5gy@',
            loginField: '#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(2) > div.loginInput > input',
            passField: '#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(3) > div.loginInput > input',
            notFoundContainer: 'body > div.max-1500.clearfix > div > div.main-content > div > div.middleArea > div > div.main-view > div > ps-not-found-page',
        }
        //FUNCTIONS JS
        async function updateBetSize(odds) {
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
        async function placeBet(page, odds) {
            if (odds >= 1.6) {
                const betAmount = await updateBetSize(odds);
                await page.waitForSelector('#stake-field');
                await page.type('#stake-field', betAmount);

                await page.waitForSelector('.place-bets-button');
                await console.log(`READY TO BET ${betAmount} RUB`);
            } else {
                await console.log(`odds are lesser than 1.6, skip`);
            }
        }
        async function bet1X2(page, pick) {
            let currentOdds = await page.evaluate((pick) => {
                let pinOdds = document.querySelector(`#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span`).innerText;
                parseFloat(pinOdds.trim());
                return pinOdds;
            }, pick);
            await page.click(`#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > div:nth-child(1)`, {
                delay: 500
            });
            await placeBet(page, currentOdds);
        }
        async function betDNB(page, pick, id) {
            let currentOdds = await page.evaluate((pick, id) => {
                let pinOdds = document.querySelector(`${id} > ps-game-event-contest > div > table > tbody > tr > td:nth-child(${pick}) > ps-contest-line > div > div.col-xs-3 > span`).innerText;
                parseFloat(pinOdds.trim());
                return pinOdds;
            }, pick, id);
            await page.click(`${id} > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > ps-contest-line > div`, {
                delay: 500
            });
            await placeBet(page, currentOdds);
        }
        async function betDC(page, pick) {
            let currentOdds = await page.evaluate((pick) => {
                let pinOdds = document.querySelector(`${pick.id} > ps-game-event-contest > div > table > tbody > tr:nth-child(${pick.tr}) > td:nth-child(${pick.td}) > ps-contest-line > div > div.col-xs-3 > span`).innerText;
                parseFloat(pinOdds.trim());
                return pinOdds;
            }, pick);
            await page.click(`${pick.id} > ps-game-event-contest > div > table > tbody > tr:nth-child(${pick.tr}) > td:nth-child(${pick.td}) > ps-contest-line > div`, {
                delay: 500
            });
            await placeBet(page, currentOdds);
        }
        // Login        
        await page.goto(pinnacle.loginUrl, {
            waitUntil: 'domcontentloaded'
        });
        await page.type(pinnacle.loginField, pinnacle.username);
        await page.type(pinnacle.passField, pinnacle.password);
        await page.click('#loginButtonContainer > input');
        // Placing bets
        for (let n = 0; n < apiResponse.length; n++) {
            console.log('== CURRENT BET ==');
            console.log(apiResponse[n]);
            //go to event page
            await page.goto(`https://beta.pinnacle.com/en/Sports/${apiResponse[n].sportId}/Leagues/${apiResponse[n].league}/Events/${apiResponse[n].event}`, {
                waitUntil: 'networkidle0'
            });
            //scroll the page to load everything
            await page.evaluate(_ => {
                window.scrollBy(0, window.innerHeight);
            });

            if (await page.$(pinnacle.notFoundContainer) === null) { //check if event page was found
                console.log(`event bettable`);
                //actions for 1х2
                if (apiResponse[n].betType === '1X2') {
                    if (await page.$('#moneyline-0') !== null) { //check if possible
                        if (apiResponse[n].pick[0] === 'PICK') {
                            await bet1X2(page, 1);
                        } else if (apiResponse[n].pick[1] === 'PICK') {
                            await bet1X2(page, 2);
                        } else if (apiResponse[n].pick[2] === 'PICK') {
                            await bet1X2(page, 3);
                        } else {
                            throw new Error(`no valid 1X2 bet found`);
                        }
                    } else {
                        console.log('pinnacle does not offer this type of bet');
                    }
                };
                //actions for h/a
                if (apiResponse[n].betType === 'H/A') {
                    if (await page.$('#moneyline-0') !== null) { //check if possible
                        apiResponse[n].pick[0] === 'PICK' ? await bet1X2(page, 1) : await bet1X2(page, 2);
                    } else {
                        console.log('pinnacle does not offer this type of bet');
                    }
                };
                //actions for Draw No Bet legit
                if (apiResponse[n].betType === 'DNB') {
                    if (await page.$('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(1)') !== null) { //check if possible
                        //find betting container
                        let containerId = await page.evaluate(() => {
                            const ROWS = document.querySelector('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9)').children.length;
                            for (let i = 0; i < ROWS; i++) {
                                let rowName = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.panel-heading.panel-collapsible > span:nth-child(2)`).innerText;
                                if (rowName.includes('DRAW NO BET')) {
                                    let id = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.collapsed.in`).getAttribute('id');
                                    return id;
                                }
                            }
                        });
                        //place bet
                        apiResponse[n].pick[0] === 'PICK' ? await betDNB(page, 1, containerId) : await betDNB(page, 2, containerId);
                    } else {
                        console.log(`pinnacle does not offer this type of bet`);
                    }
                };
                //actions for Double chance
                if (apiResponse[n].betType === 'DC') {
                    if (await page.$('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(1)') !== null) { //check if possible
                        //find betting container
                        let containerId = await page.evaluate(() => {
                            const ROWS = document.querySelector('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9)').children.length;
                            for (let i = 0; i < ROWS; i++) {
                                let rowName = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.panel-heading.panel-collapsible > span:nth-child(2)`).innerText;
                                if (rowName.includes('DOUBLE CHANCE')) {
                                    let id = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.collapsed.in`).getAttribute('id');
                                    return id;
                                }
                            }
                        });
                        //place bet
                        if (apiResponse[n].pick[0] === 'PICK') { //pick-1: tr=1 td=1, pick-2: tr=2 td=1, pick-3: tr=1 td=2
                            const pick = {
                                id: containerId,
                                tr: 1,
                                td: 1
                            };
                            await betDC(page, pick);
                        } else if (apiResponse[n].pick[1] === 'PICK') {
                            const pick = {
                                id: containerId,
                                tr: 2,
                                td: 1
                            };
                            await betDC(page, pick);
                        } else if (apiResponse[n].pick[2] === 'PICK') {
                            const pick = {
                                id: containerId,
                                tr: 1,
                                td: 2
                            };
                            await betDC(page, pick);
                        }
                    } else {
                        console.log(`pinnacle does not offer this type of bet`);
                    }
                };
                //actions for handicap
                if (apiResponse[n].betType.includes('AH')) {
                    if (await page.$('#handicap-0') !== null) { //check if handicap bet is possible
                        const betValue = apiResponse[n].betType.match(/(?<![A-Za-z])-?\+?\d*\.?\d+(?![A-Za-z])/);
                        const team = apiResponse[n].pick[0] === 'PICK' ? 1 : 2;
                        const type = '#handicap-0';
                        console.log(`type /${type}/\nbetvalue /${betValue}/\nteam /${team}/`);

                        //run findBetValue() inside a browser
                        // let betBtn = await findBetValue(page, betValue, team, type);
                        let betBtn = await page.evaluate((betValue, team, type) => {
                            let hpdValue;
                            const ROWS = document.querySelector(`${type} > ps-game-event-singles > div > table`).rows.length - 1; //-1 because they always have 1 hidden row
                            for (let i = 1; i <= ROWS; i++) {
                                hpdValue = document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerText;
                                console.log(`found AH bettable value: ${hpdValue}`);
                                if (hpdValue == betValue) {
                                    let hdpOdds = document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(4) > span`).innerText;
                                    let response = {
                                        selector: `${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`,
                                        odds: parseFloat(hdpOdds.trim()),
                                    }
                                    return response;
                                } else {
                                    console.log('no valid betvalue found');
                                }
                            }
                        }, betValue, team, type);

                        if (betBtn !== undefined) {
                            await console.log(betBtn);
                            await page.click(betBtn.selector, {
                                delay: 500
                            });
                            await placeBet(page, betBtn.odds);
                        } else {
                            console.log(`pinnacle does not offer betvalue - /${betValue}/`);
                        }
                    } else {
                        console.log(`pinnacle does not offer handicap bet for this match`);
                    }
                }
                //actions for over under
                if (apiResponse[n].betType.includes('O/U')) {
                    if (await page.$('#total-0') !== null) { //check if o/u bet is possible
                        const betValue = apiResponse[n].betType.match(/(?<![A-Za-z])-?\+?\d*\.?\d+(?![A-Za-z])/);
                        const team = apiResponse[n].pick[0] === 'PICK' ? 1 : 2;
                        const type = '#total-0';
                        console.log(`type /${type}/\nbetvalue /${betValue}/\nteam /${team}/`);
                        //find selector and odds
                        let betBtn = await page.evaluate((betValue, team, type) => {
                            let hpdValue;
                            const tableRows = document.querySelector(`${type} > ps-game-event-singles > div > table`).rows.length - 1; //-1 because they always have 1 hidden row
                            for (let i = 1; i <= tableRows; i++) {
                                hpdValue = document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerText.match(/(?<![A-Za-z])-?\+?\d*\.?\d+(?![A-Za-z])/);
                                console.log(`found bettable value: ${hpdValue}`);
                                if (hpdValue == betValue) {
                                    let hdpOdds = document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(4) > span`).innerText;
                                    let response = {
                                        selector: `${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`,
                                        odds: parseFloat(hdpOdds.trim()),
                                    }
                                    return response;
                                } else {
                                    console.log('betvalue not valid');
                                }
                            }
                        }, betValue, team, type);
                        if (betBtn !== undefined) {
                            await console.log(betBtn);
                            await page.click(betBtn.selector, {
                                delay: 500
                            });
                            await placeBet(page, betBtn.odds);
                        } else {
                            console.log(`pinnacle does not offer betvalue - /${betValue}/`);
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