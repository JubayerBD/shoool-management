import test from 'node:test';
import assert from 'node:assert/strict';
import { feeMonth, feeCalendar, monthSummary } from '../../client/src/utils/feeCalendar.js';

const today='2026-11-11';
const bill=(extra={})=>({period:{en:'2026-01'},items:[{title:{en:'Tuition fee'}}],totalAmount:1000,paidAmount:1000,status:'paid',...extra});

test('fee months follow the billed period and never an unknown or actual collection date',()=>{
  assert.equal(feeMonth(bill({paidAt:null})), '2026-01');
  assert.equal(feeMonth(bill({period:{en:'February 2026'}})), '2026-02');
  assert.equal(feeMonth(bill({period:{bn:'জানুয়ারি ২০২৬'}})), '2026-01');
  assert.equal(feeMonth(bill({period:{},billingDate:'2026-12-01'})), '2026-12');
  assert.equal(feeMonth(bill({period:{},paidAt:'2026-02-02',dueDate:'2026-02-10'})), null);
  assert.equal(feeMonth(bill({period:{en:'2026-13'}})), null);
});
test('admission and registration are kept out of monthly payment notices',()=>{
  assert.equal(feeMonth(bill({items:[{title:{en:'Admission fee — Class 1'}}]})),null);
  assert.equal(feeMonth(bill({items:[{title:{bn:'ভর্তি ফি'}}]})),null);
  assert.equal(feeMonth(bill({items:[{title:{en:'Registration fee'}}]})),null);
});
test('historical partial amounts are recorded payments, not a claim of fully paid dues',()=>{
  const result=monthSummary([bill({historicalImport:true,totalAmount:800,paidAmount:800})],today);
  assert.equal(result.state,'recorded');assert.equal(result.paid,800);assert.equal(result.due,0);
});
test('issued invoices distinguish partially paid, overdue, due, paid and waived amounts',()=>{
  assert.equal(monthSummary([bill({paidAmount:200,status:'partial',dueDate:'2026-12-10'})],today).state,'partial');
  assert.equal(monthSummary([bill({paidAmount:200,status:'partial',dueDate:'2026-10-10'})],today).state,'overdue');
  assert.equal(monthSummary([bill({paidAmount:0,status:'unpaid'})],today).state,'due');
  assert.equal(monthSummary([bill()],today).state,'paid');
  assert.equal(monthSummary([bill({paidAmount:0,waivedAmount:1000})],today).state,'settled');
  assert.equal(monthSummary([bill({status:'cancelled',paidAmount:0})],today).state,'cancelled');
});
test('scheduled amounts are forecasts, not outstanding invoices, and blank months have no assessed due',()=>{
  const forecast=monthSummary([bill({scheduled:true,status:'scheduled',paidAmount:0})],today);
  assert.equal(forecast.state,'scheduled');assert.equal(forecast.paid,0);assert.equal(forecast.due,0);assert.equal(forecast.expected,1000);
  const empty=monthSummary([],today);assert.equal(empty.state,'empty');assert.equal(empty.due,0);
});
test('year calendars combine regular and Noorani payments once and exclude admission and other years',()=>{
  const records=[bill({historicalImport:true}),bill({historicalImport:true,class:{name:{en:'Noorani'}}}),
    bill({items:[{title:{en:'Admission fee'}}]}),bill({period:{en:'2027-01'}})];
  const months=feeCalendar(records,[bill({period:{en:'2026-12'},scheduled:true,paidAmount:0})],2026,today);
  assert.equal(months.length,12);assert.equal(months[0].paid,2000);assert.equal(months[0].bills.length,2);
  assert.equal(months.filter(m=>m.paid>0).length,1);assert.equal(months[10].state,'empty');assert.equal(months[11].state,'scheduled');
});
