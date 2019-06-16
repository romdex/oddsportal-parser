const request = require('request');

async function parsingData(page, config, result) {
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

async function askPinnacle(resultData, callback) {
    let fromDate;
    (function setFromDate() {
        const date = new Date();
        let month = date.getMonth();
        let day = date.getDate();
        month -= 1;
        day += 2;
        fromDate = date
        fromDate.setMonth(month);
        fromDate.setDate(day);
        fromDate = fromDate.toISOString().replace(/[.].../, '');
    })();
    const currentDate = new Date().toISOString().replace(/[.].../, '');
    const options = {
        balance: {
            url: 'https://api.pinnacle.com/v1/client/balance',
            headers: {
                'Authorization': `Basic QU8xMDUxODk2OlNwZHVmNWd5QA==`
            }
        },
        fixtures: {
            url: `https://api.pinnacle.com/v1/fixtures?sportId=${resultData.sportId}&isLive=0`,
            headers: {
                'Authorization': `Basic QU8xMDUxODk2OlNwZHVmNWd5QA==`
            }
        },
        runningBets: {
            url: `https://api.pinnacle.com/v3/bets?betlist=RUNNING&fromDate=${fromDate}&toDate=${currentDate}`,
            headers: {
                'Authorization': `Basic QU8xMDUxODk2OlNwZHVmNWd5QA==`
            }
        },
    }
    let apiResponse = {
        // balance: null,
        // currency: null,
        event: null,
        league: null,
        sportId: resultData.sportId,
        leagueName: resultData.leagueName,
        home: resultData.player1,
        away: resultData.player2,
        betType: resultData.betType,
        pick: resultData.pick,
    };

    let runningBets;
    const betsCallback = (error, response, body) => {
        if (!error && response.statusCode == 200) {
            const data = JSON.parse(body);
            // apiResponse.balance = data.availableBalance;
            // apiResponse.currency = data.currency;
            runningBets = data.straightBets;
            request(options.fixtures, fixturesCallback);
        } else {
            throw new Error(error);
        }
    }

    const fixturesCallback = (error, response, body) => {
        if (!error && response.statusCode == 200) {
            let data = JSON.parse(body);
            data.league.forEach(element => {
                for (let el of element.events) {
                    if (el.home.includes(apiResponse.home) && el.away.includes(apiResponse.away)) { //фильтруем по имени команд
                        if (el.resultingUnit === 'Regular' && !("parentId" in el)) { //оставляем только родительский regular матч
                            let checkBets = runningBets.some(bet => bet.eventId === el.id);
                            if (!checkBets) {
                                apiResponse.event = el.id;
                                apiResponse.league = element.id;
                                callback(apiResponse);
                            } else {
                                console.log(`league/${element.id}/event/${el.id} already got placed bet, skip`);
                                callback(null);
                            }
                        }
                    }
                }
            });
        } else {
            throw new Error(error);
        }
    }
    request(options.runningBets, betsCallback);
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

async function placeBet(page, odds, apiResponse, userResponse) {
    if (parseFloat(odds) >= 1.6) {
        const betAmount = await updateBetSize(userResponse, odds, apiResponse);
        await page.waitForSelector('#stake-field');
        await page.type('#stake-field', betAmount);
        await page.waitForSelector('.place-bets-button');
        await console.log(`READY TO BET ${betAmount} RUB`);
    } else {
        await console.log(`odds are lesser than 1.6, skip`);
    }
}

async function bet1X2(page, apiResponse, pick) {
    let currentOdds = await page.evaluate((pick) => {
        let pinOdds = document.querySelector(`#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > div:nth-child(1) > ps-line > div > div.col-xs-3 > span`).innerText;
        pinOdds.trim();
        return pinOdds;
    }, pick);
    await page.click(`#moneyline-0 > ps-game-event-singles > div > table > tbody > tr > td:nth-child(${pick}) > div:nth-child(1)`, {
        delay: 500
    });
    await placeBet(page, currentOdds, apiResponse);
}

async function findBetValue(page, betValue, team, type) {
    console.log(`looking for selector - /${type} > ps-game-event-singles > div > table/`);
    if (await page.$(`${type} > ps-game-event-singles > div > table`) !== null) {
        console.log(`selector found`);
        return await page.evaluate((betValue, team, type) => {
            let hpdValue;
            const tableRows = document.querySelector(`${type} > ps-game-event-singles > div > table`).rows.length - 1; //-1 because they always have 1 hidden row
            for (let i = 1; i <= tableRows; i++) {
                hpdValue = parseFloat(document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(2)`).innerText);
                console.log(`found AH bettable value: ${hpdValue}`);
                if (hpdValue === betValue) {
                    let hdpOdds = document.querySelector(`${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team}) > ps-line > div > div:nth-child(4) > span`).innerText;
                    let response = {
                        selector: `${type} > ps-game-event-singles > div > table > tbody > tr:nth-child(${i}) > td:nth-child(${team})`,
                        odds: parseFloat( hdpOdds.trim() ),
                    }
                    return response;
                } else {
                    console.log('no valid betvalue found');
                }
            }
        }, [betValue, team, type]);    
    } else {
        console.log(`selector not found`);
    }
}

module.exports = {
    parsingData,
    askPinnacle,
    placeBet,
    bet1X2,
    findBetValue,
};