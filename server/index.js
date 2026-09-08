const path = require('path');
const express = require('express');
const config = require('./config');

const callRoutes = require('./routes/call');
const webhookRoutes = require('./routes/webhook');
const voiceRoutes = require('./routes/voices');
const escalationRoutes = require('./routes/escalations');
const whatsappRoutes = require('./routes/whatsapp');
const whatsappWebhookRoutes = require('./routes/whatsappWebhook');
const telemetryRoutes = require('./routes/telemetry');


const app = express();

// Webhook signature verification needs the raw body, so capture it before
// express.json() parses/discards it.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

app.use('/api', callRoutes);
app.use('/api', webhookRoutes);
app.use('/api', voiceRoutes);
app.use('/api', escalationRoutes);
app.use('/api', whatsappRoutes);
app.use('/api', whatsappWebhookRoutes);
app.use('/api', telemetryRoutes);


app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(config.port, () => {
  console.log(`Kollect GFF demo server listening on http://localhost:${config.port}`);
});
