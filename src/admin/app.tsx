import type { StrapiApp } from '@strapi/strapi/admin';
import { CloudUpload, Server } from '@strapi/icons';

export default {
  config: {
    locales: [],
  },
  register(app: StrapiApp) {
    app.addMenuLink({
      to: 'plugins/redirect-import',
      icon: CloudUpload,
      intlLabel: {
        id: 'redirect-import.menu.label',
        defaultMessage: 'Redirect Import',
      },
      Component: async () => {
        const page = await import('./pages/RedirectImportPage');

        return {
          default: page.default,
        };
      },
      permissions: [],
      position: 9,
    });

    app.registerPlugin({
      id: 'redirect-import',
      name: 'Redirect Import',
    });

    app.addMenuLink({
      to: 'plugins/website-tools',
      icon: Server,
      intlLabel: {
        id: 'website-tools.menu.label',
        defaultMessage: 'Website Tools',
      },
      Component: async () => {
        const page = await import('./pages/WebsiteToolsPage');

        return {
          default: page.default,
        };
      },
      permissions: [],
      position: 10,
    });

    app.registerPlugin({
      id: 'website-tools',
      name: 'Website Tools',
    });
  },
  bootstrap() {},
};
