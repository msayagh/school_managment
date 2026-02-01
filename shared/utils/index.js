const database = require('./database');
const auth = require('./auth');
const logger = require('./logger');

module.exports = {
  ...database,
  ...auth,
  ...logger
};
