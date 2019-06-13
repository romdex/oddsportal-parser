const request = require('request');
const fs = require('fs');

const askPinnacle = (homeTeam, awayTeam, sport, callback) => {
    const options = {
        balance: {
            url: 'https://api.pinnacle.com/v1/client/balance',
            headers: {
                'Authorization': `Basic QU8xMDUxODk2OlNwZHVmNWd5QA==`
            }
        },
        fixtures: {
            url: `https://api.pinnacle.com/v1/fixtures?sportId=${sport}&isLive=0`,
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
        sportId: sport,
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
                    if (el.home.includes(homeTeam) && el.away.includes(awayTeam)) { //фильтруем по имени команд
                        if (el.resultingUnit === 'Regular' && !("parentId" in el)) { //оставляем только родительский regular матч
                            apiResponse.event = el.id;
                            apiResponse.league = element.id;
                            // console.log(el);
                            console.log(`* league id: ${apiResponse.league}\n* event id: ${apiResponse.event}`);
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