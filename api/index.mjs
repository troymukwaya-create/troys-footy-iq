// Vercel serverless entry. An Express app is already a (req, res) handler,
// so exporting it directly is all Vercel's Node runtime needs.
import app from '../backend/app.js';

export default app;
