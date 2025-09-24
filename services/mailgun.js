const db = require('../utils/db');

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAIL_FROM = process.env.MAIL_FROM;
const MAILGUN_BASE_URL = process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';

function isConfigured() {
  return Boolean(MAILGUN_API_KEY && MAILGUN_DOMAIN && MAIL_FROM);
}

function getAuthHeader() {
  const token = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
  return `Basic ${token}`;
}

async function sendEmail({ to, subject, html, text, tags = [], campaignId, variables = {} }) {
  if (!isConfigured()) {
    throw new Error('Mailgun is not configured. Set MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAIL_FROM.');
  }

  const form = new FormData();
  form.append('from', MAIL_FROM);
  if (Array.isArray(to)) {
    to.forEach((recipient) => form.append('to', recipient));
  } else {
    form.append('to', to);
  }
  form.append('subject', subject);
  if (html) {
    form.append('html', html);
  }
  if (text) {
    form.append('text', text);
  }
  tags.forEach((tag) => form.append('o:tag', tag));
  if (campaignId) {
    form.append('o:campaign', String(campaignId));
  }
  if (variables && Object.keys(variables).length > 0) {
    form.append('h:X-Mailgun-Variables', JSON.stringify(variables));
  }

  const response = await fetch(`${MAILGUN_BASE_URL}/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
    },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Mailgun send failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function sendCampaign({ campaign, recipients, unsubscribeTokenFn }) {
  if (!recipients?.length) {
    return [];
  }

  const results = [];
  for (const recipient of recipients) {
    const variables = {
      subscriber_id: recipient.id,
      email: recipient.email,
    };
    if (unsubscribeTokenFn) {
      variables.unsubscribe_token = unsubscribeTokenFn(recipient.email);
    }

    const response = await sendEmail({
      to: recipient.email,
      subject: campaign.subject,
      html: campaign.html_body,
      text: campaign.text_body,
      campaignId: campaign.id,
      tags: ['campaign'],
      variables,
    });

    results.push({
      subscriberId: recipient.id,
      messageId: response.id,
      status: response.message,
    });
  }

  return results;
}

function normalizeWebhook(eventData) {
  if (!eventData) {
    return null;
  }

  if (eventData['event-data']) {
    const data = eventData['event-data'];
    return {
      event: data.event,
      email: data.recipient,
      messageId: data['message']?.headers?.['message-id'] || data['message']?.headers?.['Message-Id'] || data['message-id'],
      campaignId: data.campaigns && data.campaigns.length ? data.campaigns[0] : null,
      timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : null,
      payload: data,
    };
  }

  return {
    event: eventData.event,
    email: eventData.recipient,
    messageId: eventData['Message-Id'] || eventData['message-id'] || eventData.messageId,
    campaignId: eventData.campaign,
    timestamp: eventData.timestamp || new Date().toISOString(),
    payload: eventData,
  };
}

function recordMailEvent(event) {
  if (!event) {
    return;
  }

  db.prepare(
    `INSERT INTO mail_events (provider, event_type, message_id, email, campaign_id, payload_json, happened_at)
     VALUES ('mailgun', ?, ?, ?, ?, ?, ?)`
  ).run(
    event.event,
    event.messageId,
    event.email,
    event.campaignId || null,
    JSON.stringify(event.payload || {}),
    event.timestamp || null
  );
}

module.exports = {
  isConfigured,
  sendEmail,
  sendCampaign,
  normalizeWebhook,
  recordMailEvent,
};
