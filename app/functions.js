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
                pick.push(0);
                if (pickCells[i].hasAttribute('xparam')) {
                    pick[i] = 1;
                }
            }
            data.push({
                "sportName": sportName,
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

async function askPinnacle(resultData, callback, authHash) {
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
    const options = { //QU8xMDUxODk2OlNwZHVmNWd5QA==
        balance: {
            url: 'https://api.pinnacle.com/v1/client/balance',
            headers: {
                'Authorization': `Basic ${authHash}`
            }
        },
        fixtures: {
            url: `https://api.pinnacle.com/v1/fixtures?sportId=${resultData.sportId}&isLive=0`,
            headers: {
                'Authorization': `Basic ${authHash}`
            }
        },
        runningBets: {
            url: `https://api.pinnacle.com/v3/bets?betlist=RUNNING&fromDate=${fromDate}&toDate=${currentDate}`,
            headers: {
                'Authorization': `Basic ${authHash}`
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
        doubles: false,
    };
    if (apiResponse.sportId === 33) {
        apiResponse.home = apiResponse.home.match(/\w+\s?\-?\w+(?<![A-Z])\b(?!\.)/g);
        apiResponse.away = apiResponse.away.match(/\w+\s?\-?\w+(?<![A-Z])\b(?!\.)/g);
        console.log(`MODIFIED STRINGS: ${apiResponse.home} / ${apiResponse.away}`);
        console.log(`ARRAY1: ${apiResponse.home[0]} / ${apiResponse.away[0]}`);
        console.log(`ARRAY2: ${apiResponse.home[1]} / ${apiResponse.away[1]}`);
        apiResponse.home[1] === undefined ? apiResponse.doubles = false : apiResponse.doubles = true;
    }

    let runningBets;
    const betsCallback = (error, response, body) => {
        if (!error && response.statusCode == 200) {
            const data = JSON.parse(body);
            if ('straightBets' in data) {
                runningBets = data.straightBets;
            } else {
                runningBets = [{
                    eventId: 0,
                    leagueId: 0
                }];
            }
            // console.log(runningBets);
            apiResponse.doubles ? request(options.fixtures, fixturesDoublesCallback) : request(options.fixtures, fixturesCallback);
        } else {
            throw new Error(error);
        }
    }

    const fixturesDoublesCallback = (error, response, body) => {
        if (!error && response.statusCode == 200) {
            let data = JSON.parse(body);
            for (let leagueEl of data.league) {
                for (let eventEl of leagueEl.events) {
                    if (eventEl.home.includes(apiResponse.home[0]) 
                    && eventEl.home.includes(apiResponse.home[1])
                    && eventEl.away.includes(apiResponse.away[0])
                    && eventEl.away.includes(apiResponse.away[1])) {
                        if (eventEl.resultingUnit === 'Regular' && !("parentId" in eventEl)) {
                            let checkBets = runningBets.some(bet => bet.eventId === eventEl.id && bet.leagueId === leagueEl.id);
                            if (!checkBets) {
                                apiResponse.event = eventEl.id;
                                apiResponse.league = leagueEl.id;
                                callback(apiResponse);
                            } else {
                                console.log(`league/${leagueEl.id}/event/${eventEl.id} already got placed bet, skip`);
                                callback(null);
                            }

                        }
                    }
                }
            }
        } else {
            console.log(error);
        }
    }

    const fixturesCallback = (error, response, body) => {
        if (!error && response.statusCode == 200) {
            let data = JSON.parse(body);
            data.league.forEach(element => {
                for (let el of element.events) {
                    //действия для одиночных матчей
                    //TODO checkBets отдельной функцией
                    if (el.home.includes(apiResponse.home) && el.away.includes(apiResponse.away)) {
                        if (el.resultingUnit === 'Regular' && !("parentId" in el)) {
                            let checkBets = runningBets.some(bet => bet.eventId === el.id && bet.leagueId === element.id);
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
            console.log(error);
        }
    }
    request(options.runningBets, betsCallback);
    }

module.exports = {
    parsingData,
    askPinnacle,
};