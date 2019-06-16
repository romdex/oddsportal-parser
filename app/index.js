const config = require('../config.js');
const prompts = require('prompts');
const fsp = require('fs').promises;
const beautify = require("json-beautify");
const {
    parsingData,
    askPinnacle,
    placeBet,
    bet1X2,
    findBetValue
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

            if (await page.$(pinnacle.notFoundContainer) === null) { //check if event page was found
                console.log(`event bettable`);
                //actions for 1х2
                if (apiResponse[n].betType === '1X2') {
                    if (await page.$('#moneyline-0') !== null) { //check if possible
                        if (apiResponse[n].pick[0] === 'PICK') {
                            await bet1X2(page, apiResponse[n], 1);
                        } else if (apiResponse[n].pick[1] === 'PICK') {
                            await bet1X2(page, apiResponse[n], 2);
                        } else if (apiResponse[n].pick[2] === 'PICK') {
                            await bet1X2(page, apiResponse[n], 3);
                        } else {
                            throw new Error(`no valid 1X2 pick found`);
                        }
                    } else {
                        console.log('pinnacle does not offer this type of bet');
                    }
                };
                //actions for Home Away or Draw No Bet (cheat: its not actually placing H/A or DNB bet, needs changes)
                if (apiResponse[n].betType === 'H/A' || apiResponse[n].betType === 'DNB') {
                    await page.waitForSelector('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(1) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span')
                    if (await page.$('#moneyline-0') !== null) {
                        if (apiResponse[n].pick[0] === 'PICK') {
                            await bet1X2(page, apiResponse[n], 1);
                        } else if (apiResponse[n].pick[1] === 'PICK') {
                            await bet1X2(page, apiResponse[n], 3);
                        } else {
                            console.log(`no valid H/A or DNB pick found`);
                        }
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
                        let betBtn = await page.evaluateHandle(findBetValue(betValue, team, type), [betValue, team, type]);
                        await console.log(betBtn);
                        await page.click(betBtn.selector, {
                            delay: 500
                        });
                        await placeBet(page, betBtn.odds, apiResponse[n]);
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

                        //run findBetValue() inside a browser
                        let betBtn = await page.evaluateHandle(findBetValue(betValue, team, type), betValue, team, type);
                        await console.log(betBtn);
                        await page.click(betBtn.selector, {
                            delay: 500
                        });
                        await placeBet(page, betBtn.odds, apiResponse[n]);
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