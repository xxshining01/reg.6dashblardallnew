let appInstance = null;

export default async function handler(req, res) {
  try {
    if (!appInstance) {
      const module = await import('../server/src/index.mjs');
      appInstance = module.default || module.app;
    }
    return appInstance(req, res);
  } catch (err) {
    console.error('[Vercel Serverless Error]:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      name: err.name,
      stack: err.stack,
      nodeVersion: process.version,
    });
  }
}
