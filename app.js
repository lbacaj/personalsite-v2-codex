require('dotenv').config();

const compression = require('compression');
const cookieParser = require('cookie-parser');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dayjs = require('dayjs');
const csrf = require('csurf');

const publicRoutes = require('./routes/public');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('layout', 'layout');
app.use(expressLayouts);

app.locals.dayjs = dayjs;
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

app.use('/', publicRoutes);
app.use('/api', apiRoutes);
app.use('/webhooks', webhookRoutes);

const adminRouter = express.Router();
const csrfProtection = csrf({ cookie: true });
adminRouter.use(csrfProtection);
adminRouter.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});
adminRouter.use(adminRoutes);

app.use('/admin', adminRouter);

app.use((req, res) => {
  res.status(404);
  if (req.accepts('html')) {
    return res.render('404', {
      title: 'Not Found',
      metaDescription: 'The page you requested could not be found.',
    });
  }
  if (req.accepts('json')) {
    return res.json({ error: 'Not Found' });
  }
  return res.type('txt').send('Not Found');
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  if (req.accepts('json') && req.path.startsWith('/api')) {
    return res.status(status).json({ error: err.message || 'Internal Server Error' });
  }
  return res.status(status).render('500', {
    title: 'Server Error',
    message: 'Something went wrong. Please try again soon.',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Personal Hub listening on port ${PORT}`);
});
