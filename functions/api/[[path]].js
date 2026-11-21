// Forwards every API call to the KhatmDB Durable Object (worker/), which holds all data.
export async function onRequest({ request, env }) {
  const stub = env.KHATM.get(env.KHATM.idFromName('main'));
  return stub.fetch(request);
}
