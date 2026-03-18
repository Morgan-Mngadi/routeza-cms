import pluginId from './pluginId';

const name = 'Smart Links';

export default {
  register(app) {
    app.customFields.register({
      name: 'smart-richtext',
      pluginId,
      type: 'richtext',
      intlLabel: {
        id: `${pluginId}.smart-richtext.label`,
        defaultMessage: 'Smart rich text',
      },
      intlDescription: {
        id: `${pluginId}.smart-richtext.description`,
        defaultMessage: 'Rich text editor with an easier link insertion flow.',
      },
      components: {
        Input: async () => import('./components/SmartRichTextInput'),
      },
    });

    app.registerPlugin({
      id: pluginId,
      name,
    });
  },

  async registerTrads({ locales }) {
    return Promise.all(
      locales.map((locale) =>
        Promise.resolve({
          data: {},
          locale,
        })
      )
    );
  },
};
