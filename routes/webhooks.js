const express = require('express');

const db = require('../utils/db');
const { normalizeWebhook, recordMailEvent } = require('../services/mailgun');
const { markUnsubscribed } = require('../services/subscribers');

const router = express.Router();

router.post('/mailgun', express.json(), (req, res) => {
  const event = normalizeWebhook(req.body);
  recordMailEvent(event);

  if (event?.messageId) {
    const statusMap = {
      delivered: 'sent',
      opened: 'opened',
      clicked: 'clicked',
      complained: 'complained',
      bounced: 'bounced',
      unsubscribed: 'unsubscribed',
    };
    const status = statusMap[event.event] || 'sent';
    db.prepare(
      `UPDATE campaign_recipients
       SET status = ?,
           last_event_at = CURRENT_TIMESTAMP,
           opened_at = CASE WHEN ? = 'opened' AND opened_at IS NULL THEN CURRENT_TIMESTAMP ELSE opened_at END,
           clicked_at = CASE WHEN ? = 'clicked' AND clicked_at IS NULL THEN CURRENT_TIMESTAMP ELSE clicked_at END,
           bounced_at = CASE WHEN ? = 'bounced' AND bounced_at IS NULL THEN CURRENT_TIMESTAMP ELSE bounced_at END,
           complained_at = CASE WHEN ? = 'complained' AND complained_at IS NULL THEN CURRENT_TIMESTAMP ELSE complained_at END,
           unsubscribed_at = CASE WHEN ? = 'unsubscribed' AND unsubscribed_at IS NULL THEN CURRENT_TIMESTAMP ELSE unsubscribed_at END
       WHERE message_id = ?`
    ).run(
      status,
      status,
      status,
      status,
      status,
      status,
      event.messageId
    );
  }

  if (event?.event === 'unsubscribed' && event.email) {
    try {
      markUnsubscribed(event.email);
    } catch (error) {
      console.warn('Failed to mark unsubscribed', error.message);
    }
  }

  res.json({ success: true });
});

module.exports = router;
