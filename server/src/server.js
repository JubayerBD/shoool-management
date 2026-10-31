import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { startRecurringBilling } from './services/recurringBilling.js';
import { Invoice, Payment } from './models/Fees.js';
import { Expense } from './models/Finance.js';
import { BillingSchedule, FeeAdjustment, FeePlan } from './models/FeeWorkflow.js';

async function start() {
  try {
    await connectDB();
    // Unique occurrence/request keys must exist before accepting payments or running jobs.
    await Promise.all([Invoice, Payment, Expense, BillingSchedule, FeeAdjustment, FeePlan].map((model) => model.init()));
    startRecurringBilling();
    const app = createApp();
    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] API running on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
