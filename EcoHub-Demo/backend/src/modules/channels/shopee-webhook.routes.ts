import { Router } from 'express';
import { receiveShopeeWebhook } from './shopee-webhook.service';

const router = Router();

router.get('/', (_req, res) => {
  res.status(200).json({ ok: true, channel: 'shopee' });
});

router.post('/', async (req, res, next) => {
  try {
    const result = await receiveShopeeWebhook({
      payload: req.body,
      callbackToken: typeof req.query.token === 'string' ? req.query.token : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
