import express, { Request, Response } from 'express';
import path from 'path';

const router = express.Router();

// GET /embed - Notion embeddable version
router.get('/', (req: Request, res: Response) => {
  const publicPath = path.join(__dirname, '../../public/index.html');
  res.sendFile(publicPath);
});

// GET /embed/health - Health check for embed
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    embed: true,
    timestamp: new Date().toISOString()
  });
});

export default router;