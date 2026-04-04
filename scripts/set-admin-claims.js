const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Run: node scripts/set-admin-claims.js <uid> admin
// Or:  node scripts/set-admin-claims.js <uid> employee  
const [,, uid, role] = process.argv;
if (!uid || !role) { console.error('Usage: node set-admin-claims.js <uid> <role>'); process.exit(1); }

admin.auth().setCustomUserClaims(uid, { role })
  .then(() => { console.log(`Set role=${role} for uid=${uid}`); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
