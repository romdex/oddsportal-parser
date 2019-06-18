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
        message: 'Введите профили(через запятую) дла парсинга с Oddsportal'
    },
    {
        type: 'text',
        name: 'oddsPortalUsername',
        message: 'Имя пользователя на Oddsportal'
    },
    {
        type: 'password',
        name: 'oddsPortalPassword',
        message: 'Пароль на Oddsportal'
    },
    {
        type: 'text',
        name: 'pinnacleUser',
        message: 'Имя пользователя на pinnacle'
    },
    {
        type: 'password',
        name: 'pinnaclePassword',
        message: 'Пароль на pinnacle'
    },
    {
        type: 'number',
        name: 'bank',
        message: 'Какой банк доступен на пиннакле сейчас?'
    },
    {
        type: 'number',
        name: 'oddsFilter',
        message: 'по какому коэффициенту фильтровать? (0=off)',
        initial: 0.0,
        float: true,
    },
    {
        type: 'number',
        name: 'risk',
        message: 'average bet (%)'
    },
    {
        type: 'number',
        name: 'edge',
        message: 'ROI (%)'
    },
    {
        type: 'confirm',
        name: 'headless',
        message: 'скрывать окно браузера?',
        initial: false
    }
];

module.exports = {
    requiredSportId,
    requiredBetTypes,
    userQuestions
};