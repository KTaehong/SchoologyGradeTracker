/** Adds one check to app.json: the app is never built or started with a secret key inside. */
const { checkPublicKey } = require('./scripts/supabase-key-check');

module.exports = ({ config }) => {
  const problem = checkPublicKey(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '');
  if (problem) {
    throw new Error(problem);
  }
  return config;
};
