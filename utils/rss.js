const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

function parse(xml) {
  if (!xml) {
    return null;
  }
  return parser.parse(xml);
}

function extractEntries(feed) {
  if (!feed) {
    return [];
  }
  if (feed.feed && feed.feed.entry) {
    return Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];
  }
  if (feed.rss && feed.rss.channel && feed.rss.channel.item) {
    return Array.isArray(feed.rss.channel.item)
      ? feed.rss.channel.item
      : [feed.rss.channel.item];
  }
  return [];
}

module.exports = {
  parse,
  extractEntries,
};
