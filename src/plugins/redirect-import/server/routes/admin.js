'use strict';

module.exports = {
  type: 'admin',
  routes: [
    {
      method: 'POST',
      path: '/import',
      handler: 'redirect-import.importCsv',
      config: {},
    },
  ],
};
