import { conditionalUpdate } from './rewardJournal.ts';

const invalid = () => Object.assign(new Error('Saved payment methods require account review'), {
  status: 409, code: 'BILLING_CUSTOMER_REVIEW_REQUIRED',
});

async function verifiedCustomer(stripe: any, customerId: string, userId: string) {
  if (!/^cus_[a-zA-Z0-9]+$/.test(customerId)) throw invalid();
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted || customer.metadata?.atomxe_user_id !== userId) throw invalid();
  return customer.id;
}

/** Maps a signed-in user to one Stripe Customer; no card data touches Base44. */
export async function stripeCustomerForUser(svc: any, stripe: any, user: any) {
  const userId = String(user?.id || '');
  if (!userId) throw invalid();
  const row = await svc.User.get(userId);
  if (!row) throw invalid();
  if (row.stripe_customer_id) return verifiedCustomer(stripe, row.stripe_customer_id, userId);

  const customer = await stripe.customers.create({
    ...(typeof user.email === 'string' && user.email.includes('@')
      ? { email: user.email.slice(0, 254) } : {}),
    metadata: { atomxe_user_id: userId },
  }, { idempotencyKey: 'atomxe-customer:' + userId });
  if (!customer?.id) throw invalid();

  // Compare-and-set protects a concurrent checkout from replacing the linkage.
  await conditionalUpdate(svc.User,
    { id: userId, stripe_customer_id: { $exists: false } },
    { $set: { stripe_customer_id: customer.id } });
  const saved = await svc.User.get(userId);
  if (!saved?.stripe_customer_id) throw invalid();
  return verifiedCustomer(stripe, saved.stripe_customer_id, userId);
}
