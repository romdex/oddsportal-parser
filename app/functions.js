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

module.exports = parsingData;