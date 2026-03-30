import type { StrapiApp } from '@strapi/strapi/admin';
import { CloudUpload } from '@strapi/icons';
import InternalLinksPanel from './components/InternalLinksPanel';

export default {
  config: {
    locales: [],
  },
  register(app: StrapiApp) {
    app.getPlugin('content-manager').apis.addEditViewSidePanel([InternalLinksPanel]);

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
  },
  bootstrap() {},
};
