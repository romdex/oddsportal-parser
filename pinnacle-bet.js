const puppeteer = require('puppeteer');
const fs = require('fs');
const api = require('./pinnacle-api');

const placeBets = async (data) => {
    const pinnacleOptions = {
        loginUrl: 'https://beta.pinnacle.com/en/login',
        username: 'AO1051896',
        password: 'Spduf5gy@',
        sportId: 29
    }

    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();

    await page.goto(pinnacleOptions.loginUrl, {waitUntil: 'domcontentloaded'});
    // Login
    await page.type('#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(2) > div.loginInput > input', pinnacleOptions.username);
    await page.type('#loginMvc > form > div > div.loginContainer > div.loginFormInputs > div:nth-child(3) > div.loginInput > input', pinnacleOptions.password);
    await Promise.all([
        page.click('#loginButtonContainer > input'),
        page.waitForNavigation({waitUntil: 'domcontentloaded'})
    ]);

    data.forEach(element => {
        let ids = api(element.player1, element.player2);
        await page.goto(`https://beta.pinnacle.com/en/Sports/${pinnacleOptions.sportId}/Leagues/${ids.league}/Events/${ids.event}`);

        if (element.betType === '1X2') {
            if (element.pick[0] === 'PICK') {
                page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(1) > div:nth-child(1) > ps-line > div');
                //TODO placeBet();
            } else if (element.pick[1] === 'PICK') {
                page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(2) > div:nth-child(1) > ps-line > div');
                //TODO placeBet();
            } else if (element.pick[2] === 'PICK') {
                page.click('#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(3) > div:nth-child(1) > ps-line > div');
                //TODO placeBet();
            } else {
                throw new Error(`no valid pick found`);
            }
        }

        if (element.betType.includes('AH')) {

            //TODO placeBet();

        }
    })
};

module.exports = placeBets;