import type { StrapiApp } from '@strapi/strapi/admin';
import { Upload } from '@strapi/icons';

export default {
  config: {
    locales: [],
  },
  register(app: StrapiApp) {
    app.addMenuLink({
      to: 'plugins/redirect-import',
      icon: Upload,
      intlLabel: {
        id: 'redirect-import.menu.label',
        defaultMessage: 'Redirect Import',
      },
      Component: () => import('./pages/RedirectImportPage'),
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
