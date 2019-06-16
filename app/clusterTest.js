const config = require('../config.js');
const prompts = require('prompts');
const fsp = require('fs').promises;
const beautify = require("json-beautify");
const parsingData = require('./functions.js');
const {Cluster} = require('puppeteer-cluster');

(async () => {
    const userResponse = await prompts(config.userQuestions);
    const profilesForParsing = userResponse.usernameForParsing.split(',');

    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 20,
        monitor: true,
        puppeteerOptions: {
            headless: false
        },
        // workerCreationDelay: 100,
        timeout: 300000
    });

    cluster.on('taskerror', (err, data) => {
        console.log(`Error crawling ${data}: ${err.message}`);
    });

    for (let i = 0; i < profilesForParsing.length; i++) {
        cluster.queue(async ({page}) => {
            const oddsPortalProfile = `https://www.oddsportal.com/profile/${profilesForParsing[i].trim()}/my-predictions/next/`;
            const oddsPortalLogin = 'https://www.oddsportal.com/login/';
            const oddsPortalUsername = `${userResponse.oddsPortalUsername}`;
            const oddsPortalPassword = `${userResponse.oddsPortalPassword}`;
            const timeZone = 'https://www.oddsportal.com/set-timezone/31/';

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
                await parsingData(page, config, result);
            } else {
                for (let i = 1; i <= pages; i++) {
                    await page.goto(`${oddsPortalProfile}page/${i}/`, {waitUntil: 'domcontentloaded'});
                    await parsingData(page, config, result);
                }
            }

            if (result.length) {
                result = await result.flat();
                try {
                    await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
                } catch (e) {
                    if (e.code === 'ENOENT') {
                        await fsp.mkdir('logs');
                        await fsp.writeFile(`logs/${profilesForParsing[i].trim()}.json`, beautify(result, null, 2, 100));
                    } else {
                        console.error(e);
                    }
                }
            }
        });
    }
    await cluster.idle();
    await cluster.close();
})();