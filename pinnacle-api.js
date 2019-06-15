const request = require('request');
// const fs = require('fs');

const askPinnacle = (resultData, callback) => {
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
                                console.log(`league/${element.id}/event/${el.id} already got placed bet`);
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
module.exports = askPinnacle;