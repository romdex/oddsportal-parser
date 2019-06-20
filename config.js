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
        message: 'нижняя граница коэффициента [0=off]',
        initial: 0.0,
        float: true,
    },
    {
        type: 'number',
        name: 'oddsFilterMax',
        message: 'верхняя граница коэффициента [99=off]',
        float: true,
        initial: 14.9,
    },
    {
        type: 'select',
        name: 'risk',
        message: 'Average bet:',
        choices: [
          { title: '15%', value: 2 },
          { title: '10%', value: 3 },
          { title: '7.5%', value: 4 },
          { title: '6%', value: 5 },
          { title: '5%', value: 6 },
          { title: '4%', value: 8 },
          { title: '3%', value: 10 },
          { title: '2.5%', value: 12 },
          { title: '2%', value: 15 },
          { title: '1.5%', value: 20 },
          { title: '1%', value: 30 },
          { title: '0.5%', value: 60 }
        ],
        initial: 1
    },
    {
        type: 'number',
        name: 'edge',
        message: 'ROI (%)'
    },
    {
        type: 'number',
        name: 'timeout',
        message: 'Таймаут (минут) повторного запуска [0=off]',
        initial: 0
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