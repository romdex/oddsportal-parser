const config = require('../config');
const prompts = require('prompts');
const fsp = require('fs').promises;
const fs = require('fs');
const {
    parsingData,
    askPinnacle
} = require('./functions.js');
const puppeteer = require('puppeteer');
const json2xls = require('json2xls');
const Base64 = require('js-base64').Base64;
const beautify = require('json-beautify');
const winston = require('winston');

(async function () {
    const logger = winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        defaultMeta: {
            service: 'user-service'
        },
        transports: [
            //
            // - Write to all logs with level `info` and below to `combined.log` 
            // - Write all logs error (and below) to `error.log`.
            //
            new winston.transports.File({
                filename: 'error.log',
                level: 'error'
            }),
            new winston.transports.File({
                filename: 'combined.log'
            })
        ]
    });
    async function buildSettings() {
        console.log(`found settings.json`);
        logger.info('found settings.json');
        const settings = await fsp.readFile('settings.json', 'utf8');
        console.log(JSON.parse(settings));
        logger.info(JSON.parse(settings))
        return JSON.parse(settings);
    }
    const userResponse = fs.existsSync('settings.json') ? await buildSettings() : await prompts(config.userQuestions);

    const profilesForParsing = userResponse.usernameForParsing.split(',');
    (async function main() {
        for (let i = 0; i < profilesForParsing.length; i++) {
            const oddsPortalProfile = `https://www.oddsportal.com/profile/${profilesForParsing[i].trim()}/my-predictions/next/`;
            const oddsPortalLogin = 'https://www.oddsportal.com/login/';
            const oddsPortalUsername = `${userResponse.oddsPortalUsername}`;
            const oddsPortalPassword = `${userResponse.oddsPortalPassword}`;
            // const timeZone = 'https://www.oddsportal.com/set-timezone/31/';
            const oddsportalCookieTimeZone = {
                name: "op_user_time_zone",
                value: "0",
                url: "https://www.oddsportal.com/"
            };
            const oddsportalCookieFullTimeZone = {
                name: "op_user_full_time_zone",
                value: "31",
                url: "https://www.oddsportal.com/"
            };

            const browser = await puppeteer.launch({
                headless: userResponse.headless
            });
            const page = await browser.newPage();
            await page.setCookie(oddsportalCookieTimeZone, oddsportalCookieFullTimeZone);
            // Login
            await page.goto(oddsPortalLogin, {
                waitUntil: 'domcontentloaded'
            });
            // Login data
            await page.type('#login-username1', oddsPortalUsername);
            await page.type('#login-password1', oddsPortalPassword);
            await page.waitFor(1000);
            await Promise.all([
                page.click('#col-content > div:nth-child(3) > div > form > div:nth-child(3) > button'),
                page.waitForNavigation({
                    waitUntil: 'domcontentloaded'
                })
            ]);
            // Change time zone if needed
            // const timeZoneCheck = await page.evaluate(() => {
            //     const currentTimeZone = document.querySelector('#user-header-timezone-expander > span');
            //     return currentTimeZone.textContent.includes('GMT 0');
            // });
            // if (!timeZoneCheck) {
            //     await page.goto(timeZone, {
            //         waitUntil: 'domcontentloaded'
            //     });
            // }
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
                result = result.flat();
                // const xls = json2xls(result);
                try {
                    // await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.xlsx`, xls, 'binary');
                    await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
                } catch (e) {
                    if (e.code === 'ENOENT') {
                        await fsp.mkdir('logs');
                        // await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.xlsx`, xls, 'binary');
                        await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
                    } else {
                        console.error(e);
                    }
                }
            }
            console.log(`${profilesForParsing[i].trim()} parsed`);
            logger.info(`${profilesForParsing[i].trim()} parsed`)

            ////////////
            //PINNACLE//
            ////////////

            const pinnacle = {
                loginUrl: 'https://beta.pinnacle.com/en/login',
                username: userResponse.pinnacleUser,
                password: userResponse.pinnaclePassword,
                loginField: '#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(2) > div.loginInput > input',
                passField: '#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(3) > div.loginInput > input',
                notFoundContainer: 'body > div.max-1500.clearfix > div > div.main-content > div > div.middleArea > div > div.main-view > div > ps-not-found-page',
            };
            pinnacle.authHash = Base64.encode(`${pinnacle.username}:${pinnacle.password}`);
            console.log(`#: ${pinnacle.authHash}`);
            logger.info(`#: ${pinnacle.authHash}`)
            //ask api for IDs
            let apiResponse = [];
            for (let x = 0; x < result.length; x++) {
                await askPinnacle(result[x], data => {
                    if (data !== null) {
                        console.log(data);
                        logger.info(data);
                        apiResponse.push(data);
                    }
                }, pinnacle.authHash)
            }
            // result.forEach(elem => { //ask for fresh api data
            //     askPinnacle(elem, data => {
            //         if (data !== null) {
            //             apiResponse.push(data);
            //         }
            //     }, pinnacle.authHash);
            // });
            // console.log(apiResponse);

            //FUNCTIONS JS
            function updateBetSize(odds) {
                console.log(`bank: ${userResponse.bank}\ncurrent odds: ${odds}, risk: ${userResponse.risk}, edge: ${userResponse.edge}`);
                logger.info(`bank: ${userResponse.bank}\ncurrent odds: ${odds}, risk: ${userResponse.risk}, edge: ${userResponse.edge}`)

                let betSizePercent =
                    Math.log10(1 - (1 / (odds / (1 + (userResponse.edge / 100))))) /
                    Math.log10(Math.pow(10, -userResponse.risk));

                if (isNaN(betSizePercent)) {
                    betSizePercent = 0;
                }
                let result = (betSizePercent * userResponse.bank).toFixed(2);
                console.log(`calculated bet - ${result}`);
                logger.info(`calculated bet - ${result}`);
                return result;
            }
            async function placeBet(page, odds) {
                if (odds >= userResponse.oddsFilter && odds <= userResponse.oddsFilterMax) {
                    let betAmount = updateBetSize(odds);
                    await page.waitForSelector('#stake-field');
                    // await page.waitFor(1000);
                    await page.type('#stake-field', `${betAmount}`);
                    await page.keyboard.press('Tab');
                    await page.waitFor(500);
                    if (await page.$('div.tooltip-inner') !== null) {
                        console.log(`! stake is too small, using possible minimum`);
                        logger.info(`! stake is too small, using possible minimum`);
                        await page.$eval('div.tooltip-inner', tooltip => {
                            tooltip.click();
                        });
                    } else {
                        console.log(`* PLACING BET ${betAmount}`);
                        logger.info(`* PLACING BET ${betAmount}`);
                    }
                    await page.waitForSelector('.place-bets-button');
                    await page.waitFor(1000);
                    await page.click('.place-bets-button', {
                        delay: 500
                    });
                    // console.log(`1337`);
                    await page.waitFor(1000);
                } else {
                    console.log(`** odds are not in range, skip`);
                    logger.info(`** odds are not in range, skip`);
                }
            }
            async function bet1X2(page, pick) {
                await page.waitForSelector(`#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span`);
                // await page.waitFor(1000);
                let currentOdds = await page.$eval((`#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span`), odds => {
                    return parseFloat(odds.innerText);
                });

                if (currentOdds >= userResponse.oddsFilter && currentOdds <= userResponse.oddsFilterMax) {
                    await page.click(`#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > div:nth-child(1)`, {
                        delay: 500
                    });
                    await placeBet(page, currentOdds);
                } else {
                    console.log(`! odds are not in range, skip`);
                    logger.info(`! odds are not in range, skip`);
                }
            }
            async function betDNB(page, pick, id) {
                await page.waitForSelector(`#${id} > ps-game-event-contest > div > table > tbody > tr > td:nth-child(${pick}) > ps-contest-line > div > div.col-xs-3 > span`);
                // await page.waitFor(1000);
                let currentOdds = await page.$eval((`#${id} > ps-game-event-contest > div > table > tbody > tr > td:nth-child(${pick}) > ps-contest-line > div > div.col-xs-3 > span`), odds => {
                    return parseFloat(odds.innerText);
                });

                if (currentOdds >= userResponse.oddsFilter && currentOdds <= userResponse.oddsFilterMax) {
                    await page.click(`#${id} > ps-game-event-contest > div > table > tbody > tr > td:nth-child(${pick}) > ps-contest-line > div`, {
                        delay: 500
                    });
                    await placeBet(page, currentOdds);
                } else {
                    console.log(`! odds are not in range, skip`)
                    logger.info(`! odds are not in range, skip`);
                }
            }
            async function betDC(page, pick) {
                await page.waitForSelector(`#${pick.id} > ps-game-event-contest > div > table > tbody > tr:nth-child(${pick.tr}) > td:nth-child(${pick.td}) > ps-contest-line > div > div.col-xs-3 > span`);
                // await page.waitFor(1000);
                let currentOdds = await page.$eval((`#${pick.id} > ps-game-event-contest > div > table > tbody > tr:nth-child(${pick.tr}) > td:nth-child(${pick.td}) > ps-contest-line > div > div.col-xs-3 > span`), odds => {
                    return parseFloat(odds.innerText);
                });

                if (currentOdds >= userResponse.oddsFilter && currentOdds <= userResponse.oddsFilterMax) {
                    await page.click(`#${pick.id} > ps-game-event-contest > div > table > tbody > tr:nth-child(${pick.tr}) > td:nth-child(${pick.td}) > ps-contest-line > div`, {
                        delay: 500
                    });
                    await placeBet(page, currentOdds);
                } else {
                    console.log(`! odds are not in range, skip`)
                    logger.info(`! odds are not in range, skip`);
                }
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
                logger.info('== CURRENT BET ==');
                console.log(apiResponse[n]);
                logger.info(apiResponse[n]);
                //go to event page
                await page.goto(`https://beta.pinnacle.com/en/Sports/${apiResponse[n].sportId}/Leagues/${apiResponse[n].league}/Events/${apiResponse[n].event}`, {
                    waitUntil: 'domcontentloaded'
                });
                //scroll the page to load everything
                await page.evaluate(_ => {
                    window.scrollBy(0, window.innerHeight);
                });
                await page.waitFor(2000);
                await page.evaluate(_ => {
                    window.scrollBy(0, window.innerHeight);
                });
                await page.waitFor(1000);
                if (await page.$(pinnacle.notFoundContainer) === null) { //check if event page was found
                    console.log(`event bettable`);
                    logger.info(`event bettable`);
                    await page.waitFor(1000);
                    if (await page.$('div.close') !== null) {
                        console.log(`! active wager detected, closing...`);
                        logger.info(`! active wager detected, closing...`);
                        await page.$$eval('div.close', close => {
                            close.forEach(el => el.click());
                        });
                    }
                    //actions for 1х2
                    if (apiResponse[n].betType === '1X2') {
                        if (await page.$('#moneyline-0') !== null) { //check if possible
                            if (apiResponse[n].sportId === 4) { //basketball has no tie
                                if (apiResponse[n].pick[0] === 1) {
                                    await bet1X2(page, 1);
                                } else if (apiResponse[n].pick[2] === 1) {
                                    await bet1X2(page, 2);
                                } else {
                                    console.log(`no valid 1X2 bet found`);
                                    logger.info(`no valid 1X2 bet found`);
                                }
                            } else {
                                if (apiResponse[n].pick[0] === 1) {
                                    await bet1X2(page, 1);
                                } else if (apiResponse[n].pick[1] === 1) {
                                    await bet1X2(page, 2);
                                } else if (apiResponse[n].pick[2] === 1) {
                                    await bet1X2(page, 3);
                                } else {
                                    console.log(`no valid 1X2 bet found`);
                                    logger.info(`no valid 1X2 bet found`);
                                }
                            }
                        } else {
                            console.log('! pinnacle does not offer this type of bet');
                            logger.info('! pinnacle does not offer this type of bet');
                        }
                    };
                    //actions for h/a
                    if (apiResponse[n].betType.includes('H/A')) {
                        if (await page.$('#moneyline-0') !== null) { //check if possible
                            apiResponse[n].pick[0] === 1 ? await bet1X2(page, 1) : await bet1X2(page, 2);
                        } else {
                            console.log('! pinnacle does not offer this type of bet');
                            logger.info('! pinnacle does not offer this type of bet');
                        }
                    };
                    //actions for Draw No Bet legit
                    if (apiResponse[n].betType.includes('DNB')) {
                        if (await page.$('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(1)') !== null) { //check if possible
                            //find betting container
                            let containerId = await page.evaluate(() => {
                                const ROWS = document.querySelector('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9)').children.length;
                                for (let i = 1; i <= ROWS; i++) {
                                    let rowName = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.panel-heading.panel-collapsible > span:nth-child(2)`).innerText;
                                    if (rowName.includes('DRAW NO BET')) {
                                        let id = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.collapsed.in`).getAttribute('id');
                                        return id;
                                    } else if (i = ROWS && !rowName.includes('DRAW NO BET')) { //return null if last row does not include DNB
                                        return null;
                                    }
                                }
                            });
                            //place bet
                            if (containerId !== null) {
                                apiResponse[n].pick[0] === 1 ? await betDNB(page, 1, containerId) : await betDNB(page, 2, containerId);
                            } else {
                                console.log(`! pinnacle does not offer this type of bet`);
                                logger.info('! pinnacle does not offer this type of bet');
                            }
                        } else {
                            console.log(`! pinnacle does not offer this type of bet`);
                            logger.info('! pinnacle does not offer this type of bet');
                        }
                    };
                    //actions for Double chance
                    if (apiResponse[n].betType.includes('DC')) {
                        if (await page.$('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(1)') !== null) { //check if possible
                            //find betting container
                            let containerId = await page.evaluate(() => {
                                const ROWS = document.querySelector('ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9)').children.length;
                                for (let i = 1; i <= ROWS; i++) {
                                    let rowName = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.panel-heading.panel-collapsible > span:nth-child(2)`).innerText;
                                    if (rowName.includes('DOUBLE CHANCE')) {
                                        let id = document.querySelector(`ps-event-page > div > div.panel.panel-default > div.panel-body > div:nth-child(9) > div:nth-child(${i}) > div.collapsed.in`).getAttribute('id');
                                        return id;
                                    } else if (i = ROWS && !rowName.includes('DOUBLE CHANCE')) { //return null if last row does not include DC
                                        return null;
                                    }
                                }
                            });
                            //place bet
                            if (containerId !== null) {
                                if (apiResponse[n].pick[0] === 1) { //pick-1: tr=1 td=1, pick-2: tr=2 td=1, pick-3: tr=1 td=2
                                    const pick = {
                                        id: containerId,
                                        tr: 1,
                                        td: 1
                                    };
                                    await betDC(page, pick);
                                } else if (apiResponse[n].pick[1] === 1) {
                                    const pick = {
                                        id: containerId,
                                        tr: 2,
                                        td: 1
                                    };
                                    await betDC(page, pick);
                                } else if (apiResponse[n].pick[2] === 1) {
                                    const pick = {
                                        id: containerId,
                                        tr: 1,
                                        td: 2
                                    };
                                    await betDC(page, pick);
                                }
                            } else {
                                console.log(`! pinnacle does not offer this type of bet`);
                                logger.info('! pinnacle does not offer this type of bet');
                            }
                        } else {
                            console.log(`! pinnacle does not offer this type of bet`);
                            logger.info('! pinnacle does not offer this type of bet');
                        }
                    };
                    //actions for handicap
                    if (apiResponse[n].betType.includes('AH')) {
                        if (await page.$('#handicap-0') !== null) { //check if handicap bet is possible
                            const betValue = apiResponse[n].betType.match(/(?<![A-Za-z])-?\+?\d*\.?\d+(?![A-Za-z])/);
                            const team = apiResponse[n].pick[0] === 1 ? 1 : 2;
                            const type = '#handicap-0';
                            console.log(`* type /${type}/\nbetvalue /${betValue}/\nteam /${team}/`);
                            logger.info(`* type /${type}/\nbetvalue /${betValue}/\nteam /${team}/`);
                            //run findBetValue() inside a browser
                            // let betBtn = await findBetValue(page, betValue, team, type);
                            let betBtn = await page.evaluate((betValue, team, type) => {
                                let hpdValue;
                                const ROWS = document.querySelector(`${type} > ps-game-event-singles > div > table`).rows.length - 1; //-1 because they always have 1 hidden row
                                for (let i = 1; i <= ROWS; i++) {
                                    hpdValue = document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerText;
                                    if (hpdValue == betValue) {
                                        let hdpOdds = document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(4) > span`).innerText;
                                        let response = {
                                            selector: `${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`,
                                            odds: parseFloat(hdpOdds.trim()),
                                        }
                                        return response;
                                    } else {
                                        console.log('! no valid betvalue found');
                                    }
                                }
                            }, betValue, team, type);

                            if (betBtn !== undefined) {
                                console.log(betBtn);
                                logger.info(betBtn);
                                if (betBtn.odds >= userResponse.oddsFilter && betBtn.odds <= userResponse.oddsFilterMax) {
                                    await page.click(betBtn.selector, {
                                        delay: 500
                                    });
                                    await placeBet(page, betBtn.odds);
                                } else {
                                    console.log(`! odds are not in range, skip`);
                                    logger.info(`! odds are not in range, skip`);
                                }
                            } else {
                                console.log(`! pinnacle does not offer betvalue - /${betValue}/`);
                                logger.info(`! pinnacle does not offer betvalue - /${betValue}/`);
                            }
                        } else {
                            console.log(`! pinnacle does not offer handicap bet for this match`);
                            logger.info(`! pinnacle does not offer handicap bet for this match`);
                        }
                    }
                    //actions for over under
                    if (apiResponse[n].betType.includes('O/U')) {
                        if (await page.$('#total-0') !== null) { //check if o/u bet is possible
                            const betValue = apiResponse[n].betType.match(/(?<![A-Za-z])-?\+?\d*\.?\d+(?![A-Za-z])/);
                            const team = apiResponse[n].pick[0] === 1 ? 1 : 2;
                            const type = '#total-0';
                            console.log(`type /${type}/\nbetvalue /${betValue}/\nteam /${team}/`);
                            logger.info(`type /${type}/\nbetvalue /${betValue}/\nteam /${team}/`);
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
                                        console.log('! betvalue not valid');
                                    }
                                }
                            }, betValue, team, type);
                            if (betBtn !== undefined) {
                                console.log(betBtn);
                                logger.info(betBtn);
                                if (betBtn.odds >= userResponse.oddsFilter && betBtn.odds <= userResponse.oddsFilterMax) {
                                    await page.click(betBtn.selector, {
                                        delay: 500
                                    });
                                    await placeBet(page, betBtn.odds);
                                } else {
                                    console.log(`! odds are not in range, skip`);
                                    logger.info(`! odds are not in range, skip`);
                                }
                            } else {
                                console.log(`! pinnacle does not offer betvalue - /${betValue}/`);
                                logger.info(`! pinnacle does not offer betvalue - /${betValue}/`);
                            }
                        } else {
                            console.log(`! pinnacle does not offer over under bet for this match`);
                            logger.info(`! pinnacle does not offer over under bet for this match`);
                        }
                    }
                } else {
                    console.log('! event unbettable, skip');
                    logger.info('! event unbettable, skip');
                }
            }
            console.log(`FINISH`);
            logger.info(`FINISH`)
            //write a fresh betlog
            // askPinnacle(result[0], data => {}, true); //true - only ask for bets
            await browser.close();
        }
        if (userResponse.timeout > 0) {
            console.log(`restarting in ${userResponse.timeout} minutes`);
            logger.info(`restarting in ${userResponse.timeout} minutes`);
            setTimeout(main, userResponse.timeout * 60000);
        } else {
            process.exit(0);
        }
    })();
})();