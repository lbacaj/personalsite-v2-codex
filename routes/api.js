const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const crypto = require('crypto');

const { trackEvent } = require('../services/analytics');
const { upsertSubscriber, markUnsubscribed } = require('../services/subscribers');
const { generateUnsubscribeToken, verifyUnsubscribeToken } = require('../utils/auth');

const router = express.Router();

const trackSchema = z.object({
  event: z.string().min(1).max(50),
  path: z.string().min(1).max(500),
  referer: z.string().max(500).optional().nullable(),
  utm_source: z.string().max(100).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(100).optional().nullable(),
  utm_content: z.string().max(100).optional().nullable(),
  utm_term: z.string().max(100).optional().nullable(),
});

const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
});

const unsubscribeSchema = z.object({ token: z.string().min(10) });

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const subscribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function getOrCreateFpId(req, res) {
  let fpId = req.cookies?.fp_id;
  if (!fpId) {
    fpId = crypto.randomUUID();
    res.cookie('fp_id', fpId, {
      maxAge: 400 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return fpId;
}

router.post('/track', trackLimiter, (req, res, next) => {
  try {
    const payload = trackSchema.parse(req.body || {});
    const ua = req.get('User-Agent');
    const fpId = getOrCreateFpId(req, res);
    const utm = {
      utm_source: payload.utm_source || null,
      utm_medium: payload.utm_medium || null,
      utm_campaign: payload.utm_campaign || null,
      utm_content: payload.utm_content || null,
      utm_term: payload.utm_term || null,
    };

    trackEvent({
      event: payload.event,
      path: payload.path,
      referer: payload.referer || req.get('Referer'),
      utm,
      fpId,
      ip: req.ip,
      ua,
    });

    return res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: error.errors });
    }
    return next(error);
  }
});

router.post('/subscribe', subscribeLimiter, (req, res, next) => {
  try {
    const payload = subscribeSchema.parse(req.body || {});
    const tags = Array.isArray(payload.tags)
      ? payload.tags
      : typeof payload.tags === 'string'
        ? payload.tags.split(',').map((tag) => tag.trim())
        : [];

    if (!tags.includes('site')) {
      tags.push('site');
    }

    const subscriber = upsertSubscriber({
      email: payload.email,
      name: payload.name,
      source: 'site',
      tags,
      utm: {
        utm_source: req.body?.utm_source,
        utm_medium: req.body?.utm_medium,
        utm_campaign: req.body?.utm_campaign,
        utm_content: req.body?.utm_content,
        utm_term: req.body?.utm_term,
      },
      referer: req.get('Referer'),
    });

    return res.json({ success: true, unsubscribe_token: generateUnsubscribeToken(subscriber.email) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: error.errors });
    }
    return next(error);
  }
});

router.post('/unsubscribe', (req, res, next) => {
  try {
    const { token } = unsubscribeSchema.parse(req.body || {});
    const email = verifyUnsubscribeToken(token);
    if (!email) {
      return res.status(400).json({ error: 'Invalid unsubscribe token' });
    }
    const subscriber = markUnsubscribed(email);
    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: error.errors });
    }
    return next(error);
  }
});

module.exports = router;
