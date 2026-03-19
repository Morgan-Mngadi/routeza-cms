import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: [],
  },
  register(app: StrapiApp) {
    app.addMenuLink({
      to: '/plugins/redirect-import',
      intlLabel: {
        id: 'redirect-import.menu.label',
        defaultMessage: 'Redirect Import',
      },
      Component: async () => import('./pages/RedirectImportPage'),
      permissions: [],
      position: 9,
    });

    app.registerPlugin({
      id: 'redirect-import',
      name: 'Redirect Import',
    });
  },
  bootstrap() {},
};
