import 'dotenv/config';
import './instrument'; // Sentry.init (+ redaction) — after env, before express is imported
import app from './app';
import { startStaleSweep } from './services/staleSweepService';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[🚀 Server]: Express backend running on port ${PORT}`);
  startStaleSweep();
});

export default app;
