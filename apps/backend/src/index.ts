import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[🚀 Server]: Express backend running on port ${PORT}`);
});

export default app;
