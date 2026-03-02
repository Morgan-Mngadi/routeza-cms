import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  const uploadProvider = env('UPLOAD_PROVIDER', 'local');

  if (uploadProvider !== 'aws-s3') {
    return {};
  }

  return {
    upload: {
      config: {
        provider: 'aws-s3',
        providerOptions: {
          baseUrl: env('S3_BASE_URL'),
          rootPath: env('S3_ROOT_PATH', ''),
          s3Options: {
            credentials: {
              accessKeyId: env('S3_ACCESS_KEY_ID'),
              secretAccessKey: env('S3_ACCESS_SECRET'),
            },
            region: env('S3_REGION'),
            params: {
              Bucket: env('S3_BUCKET'),
            },
            endpoint: env('S3_ENDPOINT'),
            forcePathStyle: env.bool('S3_FORCE_PATH_STYLE', false),
          },
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
      },
    },
  };
};

export default config;
