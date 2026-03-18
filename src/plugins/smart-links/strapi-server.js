'use strict';

module.exports = () => ({
  register({ strapi }) {
    strapi.customFields.register({
      name: 'smart-richtext',
      plugin: 'smart-links',
      type: 'richtext',
      inputSize: {
        default: 12,
        isResizable: true,
      },
    });
  },
});
