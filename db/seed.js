require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const dayjs = require('dayjs');
const db = require('../utils/db');
const { runMigrations } = require('./migrate');

const heroParagraphs = JSON.stringify([
  'I used to manage many <a href="https://twitter.com/LBacaj/status/1478241311392108545" target="_blank" rel="noopener noreferrer">engineering teams</a>. I also invest in real estate. I enjoy making money with bits and diversifying out into atoms.',
  'I write. And I teach other introverts, like myself, to get started with newsletters and sharing online.',
  "And I love building things. I've built software, tools, info products, and games.",
  'If you want the long version, I wrote <a href="/about">more of my story here</a>.'
]);

const appearedOn = JSON.stringify([
  {
    title: 'The Pragmatic Engineer Newsletter',
    url: 'https://newsletter.pragmaticengineer.com/p/from-engineer-to-director',
    image: '/images/legacy/pragmaticengineer200pxby200px.jpg',
    alt: 'The Pragmatic Engineer Newsletter featuring Louie Bacaj'
  },
  {
    title: 'Write of Passage',
    url: 'https://writeofpassage.com/blog/louie-bacaj-case-study/',
    image: '/images/legacy/woplogo200px.jpg',
    alt: 'Write of Passage case study featuring Louie Bacaj'
  },
  {
    title: 'Tech Lead Journal',
    url: 'https://techleadjournal.dev/episodes/181/',
    image: '/images/legacy/techlead300.png',
    alt: 'Tech Lead Journal podcast featuring Louie Bacaj'
  },
  {
    title: 'The Bootstrapped Founder',
    url: 'https://www.youtube.com/watch?v=-c_Nh5_RbTg',
    image: '/images/legacy/bootstrappedfounderwebp.webp',
    alt: 'The Bootstrapped Founder interview with Louie Bacaj'
  },
  {
    title: 'Taro',
    url: 'https://www.jointaro.com/course/timeless-career-advice-for-software-engineers/',
    image: '/images/legacy/taro300.png',
    alt: 'Taro course by Louie Bacaj'
  },
  {
    title: 'Writer on the Side',
    url: 'https://podcasts.apple.com/us/podcast/how-to-start-a-successful-newsletter-with-louie-bacaj/id1441879858?i=1000584741066',
    image: '/images/legacy/writerOntheside200px.jpg',
    alt: 'Writer on the Side podcast featuring Louie Bacaj'
  }
]);

const recentEssays = JSON.stringify([
  {
    title: 'Two Years In The Arena',
    source: 'The M&Ms Newsletter · 119th Edition',
    description:
      "Lessons from my two year anniversary since quitting the big company job, walking away from a huge guaranteed salary, to become an entrepreneur.",
    url: 'https://newsletter.memesmotivations.com/p/m-and-ms-two-years-in-the-arena'
  },
  {
    title: 'How to Find Ideas to Build',
    source: 'The M&Ms Newsletter · 144th Edition',
    description:
      'A formula for finding ideas to build out. This is what I did to make my first few dollars online on my own and what I saw many others do too.',
    url: 'https://newsletter.memesmotivations.com/p/m-and-ms-how-to-find-ideas-to-build'
  },
  {
    title: 'The Original "PDF Hustler"',
    source: 'Small Bets Newsletter',
    description:
      "How writing an annual almanack led to Benjamin Franklin's fortune, and the freedom to pursue a multi-disciplinary life.",
    url: 'https://newsletter.smallbets.co/p/the-original-pdf-hustler'
  }
]);

const aboutLongHtml = `
  <p>Over the last decade, I've helped build multiple engineering teams and systems that scaled to millions of users.</p>
  <p>As an early engineer at an eCommerce startup called Jet.com, I grew into an engineering leader. That startup sold to Walmart for $3.3 Billion. At Walmart, I grew to a Senior Director of Engineering. My teams and I built Pharmacy Tech, with over $35 Billion in annual revenue and 100m patients.</p>
  <p>But I decided to leave that career behind for entrepreneurship.</p>
  <p>Coming from poverty, walking away from guaranteed money as an employee wasn't easy for me. I tried a few times to quit and couldn't bring myself to do it. I immigrated to the U.S. from a young age; I was born poor in Albania. Then I grew up poor in The Bronx, NYC, for most of my life too.</p>
  <p>But I knew that if I didn't chase my dreams of entrepreneurship, I'd always regret it.</p>
  <p>Before quitting, I tried to de-risk the move as much as possible by investing in real estate. And I've fallen in love with real estate on a small scale. I don't want to make real estate a full-time career, but part-time, I've found it's a great way to diversify into atoms from just bits and create some income.</p>
  <p>Since quitting, I've realized that building an audience is an asset to entrepreneurship. It's a great way to help people and to have them help you.</p>
  <p>As an introverted and sometimes awkward software engineer who's stared at screens way too much, I had no idea where to start. But I just started writing and tweeting my story and everything I've learned so far. In that process, I grew a sizeable audience. Although I still fall back to my hermit ways at times to just build things, I've found that it is very enjoyable to help and teach other people, too.</p>
  <p>Since starting this entrepreneurial journey in September 2021, I've built multiple SaaS apps; some of them have flopped, and some have made a little money. I was an equal partner in an online community called Small Bets and helped build that in its early stages. I've created recorded courses and taught people live, which has made some money as well.</p>
  <p>I've found that I am very interested in the freedom this entrepreneurial journey has given me. The freedom to be around while my kids are young, the freedom to work at strange hours, the freedom to work on what I want to work on and with who I want to work with.</p>
  <p>In between making things, I am taking classes. Even though I have a Bachelor's and Master's in Computer Science, I've become obsessed with becoming more of a multi-disciplinary thinker. I am taking classes in math, science, engineering, etc. But I am not limiting myself to just the hard sciences; I am also enjoying psychology, sociology, history, and so on.</p>
  <p>My entrepreneurial heroes, like Charlie Munger, are multi-disciplinary thinkers. Since starting this entrepreneurial journey, I've aspired to become more multi-disciplinary, and I write about that. But if I can think at a fraction of the level my heroes were able to think at, I will consider that a big win.</p>
  <p>I have spent most of my career writing code and programming things behind a screen. In the short term, I'd like to experiment with taking the code I write out of just the screen and into some smart devices. Longer term, 5 years plus, my hope is some of the things I build can turn into a more durable business.</p>
`.trim();

const aboutHelpCards = JSON.stringify([
  {
    title: 'My SaaS Apps',
    description: "I've built many apps over the last few years. Audience tools for Twitter, real estate management, community tools, and bots powered by LLMs.",
    image: '/images/legacy/threadx.png',
    linkText: 'See Small Bets',
    linkUrl: 'https://smallbets.com/'
  },
  {
    title: 'The M&Ms Newsletter',
    description: 'I send stories and lessons on engineering, entrepreneurship, and personal growth.',
    image: '/images/legacy/memesAndMotivations.webp',
    linkText: 'Join 5K+ subscribers',
    linkUrl: 'https://newsletter.memesmotivations.com/'
  },
  {
    title: 'My Digital Products',
    description: 'Courses to help your software engineering career and to help you start a newsletter.',
    image: '/images/legacy/timelessCareerAdvice.webp',
    linkText: 'View courses',
    linkUrl: 'https://lbacaj.gumroad.com/'
  }
]);

db.pragma('foreign_keys = ON');

db.exec('PRAGMA busy_timeout = 5000');

function upsertSetting(key, value) {
  db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, value);
}

function seedSettings() {
  const defaults = {
    'site.title': 'Louie Bacaj',
    'site.description': 'Software engineer turned entrepreneur, sharing lessons on building products, audiences, and a multi-disciplinary life.',
    'site.hero_heading': "Hi, I'm Louie Bacaj.",
    'site.hero_subheading': 'I am a Software Engineer who turned Entrepreneur.',
    'site.hero_cta_text': 'Read the latest',
    'site.hero_paragraphs': heroParagraphs,
    'site.hero_image_path': '/images/legacy/LouieSocialv2.PNG',
    'site.hero_image_alt': 'Louie Bacaj smiling in front of a bookshelf',
    'site.about_html':
      '<p>I build software, teach introverts to share online, invest in real estate, and write about the journey from engineering leader to entrepreneur.</p>',
    'site.about_long_html': aboutLongHtml,
    'site.about_help_cards': aboutHelpCards,
    'site.appeared_on': appearedOn,
    'site.recent_essays': recentEssays,
    'site.newsletter_embed_url': 'https://newsletter.memesmotivations.com/embed',
    'site.social_links': JSON.stringify([
      { label: 'GitHub', url: 'https://github.com/lbacaj', icon: 'github' },
      { label: 'YouTube', url: 'https://youtube.com/@lbacaj', icon: 'youtube' },
      { label: 'Substack', url: 'https://louiebacaj.substack.com', icon: 'newsletter' },
      { label: 'X (Twitter)', url: 'https://twitter.com/lbacaj', icon: 'x' },
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/lbacaj', icon: 'linkedin' }
    ]),
    'integrations.github_user': process.env.GITHUB_USER || '',
    'integrations.youtube_channel_id': process.env.YOUTUBE_CHANNEL_ID || '',
    'integrations.substack_feed_url': process.env.SUBSTACK_FEED_URL || '',
    'integrations.openai_model': 'gpt-4.1-mini',
    'mailgun.domain': process.env.MAILGUN_DOMAIN || '',
    'mailgun.from': process.env.MAIL_FROM || '',
    'mailgun.base_url': process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net',
    'site.favicon_path': '/images/legacy/favicon.png'
  };

  db.withTransaction(() => {
    Object.entries(defaults).forEach(([key, value]) => upsertSetting(key, value));
  });
}

function seedFeaturedItems() {
  const existingCount = db.prepare('SELECT COUNT(1) AS count FROM items').get().count;
  if (existingCount > 0) {
    return;
  }

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const items = [
    {
      type: 'feature',
      source_id: null,
      source_url: 'https://www.hellocode.co/podcast/louie-bacaj',
      title: 'HelloCode Podcast Interview',
      description:
        'Louie joined the HelloCode podcast to talk about bootstrapping indie products, building in public, and lessons learned from engineering leadership.',
      blurb: 'On HelloCode, Louie shares candid lessons from indie hacking and leading engineering teams.',
      image_url: '/images/legacy/features/hellocode.png',
      tags: 'podcast,interview',
      published_at: now,
      featured: 1
    },
    {
      type: 'product',
      source_id: 'shipdeploy',
      source_url: 'https://shipdeploy.com',
      title: 'ShipDeploy',
      description:
        'ShipDeploy helps engineering teams deploy with confidence through automated workflows, checklists, and accountability.',
      blurb: 'ShipDeploy keeps your team shipping by combining workflows, alerts, and accountability tooling.',
      image_url: '/images/legacy/products/shipdeploy.png',
      tags: 'product,saas',
      published_at: now,
      featured: 1
    },
    {
      type: 'app',
      source_id: 'zanscards',
      source_url: 'https://zanscards.com',
      title: "Zan's Cards",
      description:
        "A small app that helps parents teach Macedonian to their kids with digital flash cards and playful review sessions.",
      blurb: "Zan's Cards helps teach Macedonian through adorable flash cards and simple review games.",
      image_url: '/images/legacy/apps/zanscards.png',
      tags: 'app,kids',
      published_at: now,
      featured: 1
    }
  ];

  const insert = db.prepare(
    `INSERT INTO items(type, source_id, source_url, title, description, blurb, image_url, tags, published_at, featured)
     VALUES (@type, @source_id, @source_url, @title, @description, @blurb, @image_url, @tags, @published_at, @featured)`
  );

  db.withTransaction(() => {
    items.forEach((item) => insert.run(item));
  });
}

async function main() {
  runMigrations();
  seedSettings();
  seedFeaturedItems();
  console.log('Database seeded.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
