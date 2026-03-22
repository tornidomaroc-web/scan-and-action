import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { mockAuthMiddleware } from './middleware/mockAuthMiddleware';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Registry Maps
app.use('/api', mockAuthMiddleware, routes);

// Central Error Trap
app.use(errorHandler);

export default app;
