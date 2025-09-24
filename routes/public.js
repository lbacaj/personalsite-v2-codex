const express = require('express');
const dayjs = require('dayjs');

const { getAllSettings, getJsonSetting } = require('../utils/settings');
const { getItemsByType } = require('../services/items');
const { verifyUnsubscribeToken } = require('../utils/auth');

const router = express.Router();

function parseSocialLinks(settings) {
  const linksJson = settings['site.social_links'];
  if (!linksJson) {
    return [];
  }
  try {
    return JSON.parse(linksJson);
  } catch (error) {
    console.warn('Failed to parse social links JSON', error.message);
    return [];
  }
}

router.use((req, res, next) => {
  const settings = getAllSettings();
  res.locals.settings = settings;
  res.locals.site = {
    title: settings['site.title'] || 'Personal Hub',
    description: settings['site.description'] || '',
    socialLinks: parseSocialLinks(settings),
  };
  res.locals.currentYear = dayjs().year();
  next();
});

router.get('/', (req, res) => {
  const settings = res.locals.settings;
  const hero = {
    heading: settings['site.hero_heading'] || "Hi, I'm Louie Bacaj.",
    subheading: settings['site.hero_subheading'] || 'I am a Software Engineer who turned Entrepreneur.',
    ctaText: settings['site.hero_cta_text'] || 'Read the latest',
    paragraphs: getJsonSetting('site.hero_paragraphs', []),
    image: settings['site.hero_image_path'] || '/images/legacy/LouieSocialv2.PNG',
    imageAlt:
      settings['site.hero_image_alt'] || 'Louie Bacaj smiling in front of a bookshelf',
  };

  const indieHackersUrl =
    'https://www.indiehackers.com/post/quitting-his-venture-backed-startup-to-make-300k-yr-from-small-bets-powl5CXvHQRKROJSXpJ9';
  const indieHackersImage = '/images/legacy/indie-hackers.png';
  const indieHackersFeature = {
    title: 'Indie Hackers',
    url: indieHackersUrl,
    source_url: indieHackersUrl,
    image: indieHackersImage,
    image_url: indieHackersImage,
    alt: 'Indie Hackers feature on Louie Bacaj',
  };

  const appearedOnSetting = getJsonSetting('site.appeared_on', []);
  const appearedOn = Array.isArray(appearedOnSetting) ? [...appearedOnSetting] : [];
  const hasIndieHackersAppearance = appearedOn.some(
    (feature) => (feature.url || feature.source_url) === indieHackersUrl
  );
  if (!hasIndieHackersAppearance) {
    appearedOn.unshift(indieHackersFeature);
  }
  const appearedOnDisplay = appearedOn.slice(0, 6);
  const recentEssays = getJsonSetting('site.recent_essays', []);
  const newsletterEmbedUrl = settings['site.newsletter_embed_url'] || '';

  const projects = getItemsByType('github', { featuredOnly: true, limit: 3 });
  const openSource = projects.length ? projects : getItemsByType('github', { limit: 3 });
  const videos = getItemsByType('youtube', { limit: 3 });
  const newsletterPosts = getItemsByType('substack', { limit: 3 });
  const apps = getItemsByType('app', { featuredOnly: true, limit: 3 });
  const featuredApps = apps.length ? apps : getItemsByType('app', { limit: 3 });
  const featuresRaw = getItemsByType('feature', { featuredOnly: true, limit: 12 });
  const features = Array.isArray(featuresRaw) ? [...featuresRaw] : [];
  const hasIndieHackersFeature = features.some(
    (feature) => (feature.url || feature.source_url) === indieHackersUrl
  );
  if (!hasIndieHackersFeature) {
    features.unshift(indieHackersFeature);
  }

  const socialPosts = (() => {
    const xPosts = getItemsByType('x_post', { limit: 5 });
    const linkedinPosts = getItemsByType('linkedin_post', { limit: 5 });
    const combined = [...xPosts, ...linkedinPosts];
    return combined
      .sort((a, b) => {
        const aDate = a.published_at || a.created_at || '';
        const bDate = b.published_at || b.created_at || '';
        return bDate.localeCompare(aDate);
      })
      .slice(0, 3);
  })();

  res.render('index', {
    hero,
    appearedOn: appearedOnDisplay,
    recentEssays,
    newsletterEmbedUrl,
    openSource,
    featuredApps,
    newsletterPosts,
    videos,
    socialPosts,
    features,
  });
});

router.get('/projects', (req, res) => {
  const projects = getItemsByType('github');
  res.render('projects', {
    title: 'Projects',
    projects,
  });
});

router.get('/videos', (req, res) => {
  const videos = getItemsByType('youtube');
  res.render('videos', {
    title: 'Videos',
    videos,
  });
});

router.get('/newsletter', (req, res) => {
  const posts = getItemsByType('substack', { limit: 20 });
  res.render('newsletter', {
    title: 'Newsletter',
    posts,
  });
});

router.get('/products', (req, res) => {
  const products = getItemsByType('product');
  res.render('products', {
    title: 'Products',
    products,
  });
});

router.get('/apps', (req, res) => {
  const apps = getItemsByType('app');
  res.render('apps', {
    title: 'Apps & Games',
    apps,
  });
});

router.get('/features', (req, res) => {
  const features = getItemsByType('feature');
  res.render('features', {
    title: 'Features & Press',
    features,
  });
});

router.get('/about', (req, res) => {
  const settings = res.locals.settings;
  const aboutHtml = settings['site.about_long_html'] || '';
  const heroImage = settings['site.hero_image_path'] || '/images/legacy/LouieSocialv2.PNG';
  const heroImageAlt = settings['site.hero_image_alt'] || 'Louie Bacaj smiling in front of a bookshelf';
  const featuredApps = getItemsByType('app', { featuredOnly: true, limit: 3 });
  const apps = featuredApps.length ? featuredApps : getItemsByType('app', { limit: 3 });

  res.render('about', {
    title: 'About',
    aboutHtml,
    heroImage,
    heroImageAlt,
    apps,
  });
});

router.get('/privacy', (req, res) => {
  res.render('privacy', {
    title: 'Privacy Policy',
  });
});

router.get('/terms', (req, res) => {
  res.render('terms', {
    title: 'Terms of Service',
  });
});

router.get('/unsubscribe', (req, res) => {
  const token = req.query.token;
  const email = verifyUnsubscribeToken(token);
  const invalid = !token || !email;
  res.render('unsubscribe', {
    title: 'Unsubscribe',
    token,
    email,
    invalid,
  });
});

module.exports = router;
