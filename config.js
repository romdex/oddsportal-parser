const requiredSportId = {
    "Soccer": 29,
    "Basketball": 4,
    "Baseball": 3,
    "Tennis": 33,
    "Volleyball": 34,
    "Hockey": 19,
    "Handball": 18
};

const requiredBetTypes = ["H/A", "1X2", "AH", "O/U", "DNB", "DC"];

const userQuestions = [
    {
        type: 'text',
        name: 'usernameForParsing',
        message: 'Имя профиля дла парсинга с Oddsportal'
    },
    {
        type: 'text',
        name: 'oddsPortalUsername',
        message: 'Имя пользователя на Oddsportal'
    },
    {
        type: 'text',
        name: 'oddsPortalPassword',
        message: 'Пароль на Oddsportal'
    }
];

module.exports = {
    requiredSportId,
    requiredBetTypes,
    userQuestions
};