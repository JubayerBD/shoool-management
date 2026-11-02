import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { startRecurringBilling } from './services/recurringBilling.js';
import { Invoice, Payment } from './models/Fees.js';
import { Expense, Income } from './models/Finance.js';
import { BillingSchedule, FeeAdjustment, FeePlan } from './models/FeeWorkflow.js';
import { ProfitDistribution, ProfitDistributionLock } from './models/ProfitDistribution.js';
import { OpeningBalance, ProfitPayment } from './models/CashBalance.js';
import { ActivityLog } from './models/ActivityLog.js';
import { startAutomaticBackups } from './services/backups.js';
import { FinancialCorrection, FinancialLock } from './models/FinancialCorrection.js';
import { migrateSalaryIndex } from './services/financialOperations.js';
import { CalendarEvent } from './services/academicCalendar.js';

async function start() {
  try {
    await connectDB();
    await migrateSalaryIndex();
    await CalendarEvent.init();
    // Unique occurrence/request keys must exist before accepting payments or running jobs.
    await Promise.all([Invoice, Payment, Expense, BillingSchedule, FeeAdjustment, FeePlan, ProfitDistribution, ProfitDistributionLock, OpeningBalance, ProfitPayment, ActivityLog, FinancialCorrection, FinancialLock, Income].map((model) => model.init()));
    await ProfitDistributionLock.updateOne({ _id: 'distribution' }, { $setOnInsert: { version: 0 } }, { upsert: true });
    startRecurringBilling();
    startAutomaticBackups();
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
