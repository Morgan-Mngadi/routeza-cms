import type { Schema, Struct } from '@strapi/strapi';

export interface ArticleCallout extends Struct.ComponentSchema {
  collectionName: 'components_article_callouts';
  info: {
    displayName: 'Callout';
    icon: 'information';
  };
  attributes: {
    body: Schema.Attribute.Text & Schema.Attribute.Required;
    title: Schema.Attribute.String;
    tone: Schema.Attribute.Enumeration<
      ['neutral', 'info', 'success', 'warning']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'neutral'>;
  };
}

export interface ArticleList extends Struct.ComponentSchema {
  collectionName: 'components_article_lists';
  info: {
    displayName: 'List';
    icon: 'bulletList';
  };
  attributes: {
    itemsText: Schema.Attribute.Text & Schema.Attribute.Required;
    listStyle: Schema.Attribute.Enumeration<['unordered', 'ordered']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'unordered'>;
    title: Schema.Attribute.String;
  };
}

export interface ArticleRichText extends Struct.ComponentSchema {
  collectionName: 'components_article_rich_texts';
  info: {
    displayName: 'Rich Text';
    icon: 'align-left';
  };
  attributes: {
    body: Schema.Attribute.RichText & Schema.Attribute.Required;
  };
}

export interface ArticleSectionHeading extends Struct.ComponentSchema {
  collectionName: 'components_article_section_headings';
  info: {
    displayName: 'Section Heading';
    icon: 'heading';
  };
  attributes: {
    level: Schema.Attribute.Enumeration<['h1', 'h2', 'h3', 'h4']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'h2'>;
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface PageCallout extends Struct.ComponentSchema {
  collectionName: 'components_page_callouts';
  info: {
    displayName: 'Callout';
    icon: 'information';
  };
  attributes: {
    body: Schema.Attribute.Text & Schema.Attribute.Required;
    title: Schema.Attribute.String;
    tone: Schema.Attribute.Enumeration<
      ['neutral', 'info', 'success', 'warning']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'neutral'>;
  };
}

export interface PageCta extends Struct.ComponentSchema {
  collectionName: 'components_page_ctas';
  info: {
    displayName: 'Call To Action';
    icon: 'cursor';
  };
  attributes: {
    body: Schema.Attribute.Text;
    buttonHref: Schema.Attribute.String & Schema.Attribute.Required;
    buttonLabel: Schema.Attribute.String & Schema.Attribute.Required;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface PageList extends Struct.ComponentSchema {
  collectionName: 'components_page_lists';
  info: {
    displayName: 'List';
    icon: 'bulletList';
  };
  attributes: {
    itemsText: Schema.Attribute.Text & Schema.Attribute.Required;
    listStyle: Schema.Attribute.Enumeration<['unordered', 'ordered']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'unordered'>;
    title: Schema.Attribute.String;
  };
}

export interface PageRichText extends Struct.ComponentSchema {
  collectionName: 'components_page_rich_texts';
  info: {
    displayName: 'Rich Text';
    icon: 'align-left';
  };
  attributes: {
    body: Schema.Attribute.RichText & Schema.Attribute.Required;
  };
}

export interface PageSectionHeading extends Struct.ComponentSchema {
  collectionName: 'components_page_section_headings';
  info: {
    displayName: 'Section Heading';
    icon: 'heading';
  };
  attributes: {
    level: Schema.Attribute.Enumeration<['h1', 'h2', 'h3', 'h4']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'h2'>;
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SeoSeo extends Struct.ComponentSchema {
  collectionName: 'components_seo_seos';
  info: {
    displayName: 'SEO';
    icon: 'search';
  };
  attributes: {
    canonicalUrl: Schema.Attribute.String & Schema.Attribute.Required;
    metaDescription: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 155;
        minLength: 120;
      }>;
    metaTitle: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60;
        minLength: 20;
      }>;
    noindex: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<false>;
    ogImage: Schema.Attribute.Media<'images'>;
    schemaJson: Schema.Attribute.JSON;
  };
}

export interface SharedPullQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_pull_quotes';
  info: {
    displayName: 'Pull Quote';
  };
  attributes: {
    author: Schema.Attribute.String;
    role: Schema.Attribute.String;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'article.callout': ArticleCallout;
      'article.list': ArticleList;
      'article.rich-text': ArticleRichText;
      'article.section-heading': ArticleSectionHeading;
      'page.callout': PageCallout;
      'page.cta': PageCta;
      'page.list': PageList;
      'page.rich-text': PageRichText;
      'page.section-heading': PageSectionHeading;
      'seo.seo': SeoSeo;
      'shared.pull-quote': SharedPullQuote;
    }
  }
}
