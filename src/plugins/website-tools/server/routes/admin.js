'use strict';

module.exports = {
  type: 'admin',
  routes: [
    {
      method: 'POST',
      path: '/purge-cache',
      handler: 'website-tools.purgeCache',
      config: {},
    },
  ],
};
