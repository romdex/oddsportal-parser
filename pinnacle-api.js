const request = require('request');
const fs = require('fs');
//(homeTeam, awayTeam, sport, callback)
const askPinnacle = (resultData, callback) => {
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
        }
    }
    let apiResponse = {
        balance: null,
        currency: null,
        event: null,
        league: null,
        sportId: resultData.sportId,
        leagueName: resultData.leagueName,
        home: resultData.player1,
        away: resultData.player2,
        betType: resultData.betType,
        pick: resultData.pick,
    };
    
    const balanceCallback = (error, response, body) => {
        if (!error && response.statusCode == 200) {
            const data = JSON.parse(body);
            apiResponse.balance = data.availableBalance;
            apiResponse.currency = data.currency; //оно надо вообще?
            console.log(`Current balance: ${data.availableBalance} ${data.currency}`);
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
                            apiResponse.event = el.id;
                            apiResponse.league = element.id;
                            callback(apiResponse);
                        }
                    }
                }
            });
        } else {
            throw new Error(error);
        }
    }

    request(options.balance, balanceCallback);
}
module.exports = askPinnacle;