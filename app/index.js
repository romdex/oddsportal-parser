const config = require('../config.js');
const prompts = require('prompts');
const fs = require('fs');
const beautify = require("json-beautify");
const getScrappedData = require('./functions.js');
const puppeteer = require('puppeteer');

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
            await getScrappedData(page, config, result);
        } else {
            for (let i = 1; i <= pages; i++) {
                await page.goto(`${oddsPortalProfile}page/${i}/`, {waitUntil: 'domcontentloaded'});
                await getScrappedData(page, config, result);
            }
        }

        if (result.length) {
            result = result.flat();
            if (!fs.existsSync('logs')){
                fs.mkdirSync('logs');
            }
            fs.writeFileSync(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
        }
        console.log(`${profilesForParsing[i].trim()} parsed`);
        await browser.close();
    }
})();