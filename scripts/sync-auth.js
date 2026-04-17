const admin = require('firebase-admin');
const path = require('path');
const serviceAccountPath = path.resolve(__dirname, '../service-account.json');
const serviceAccount = require(serviceAccountPath);

// Prod
const prodApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'prodAuth');
const prodAuth = prodApp.auth();

// Local Emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
const localApp = admin.initializeApp({ projectId: serviceAccount.project_id }, 'localAuth');
const localAuth = localApp.auth();

async function syncAuth() {
  console.log('🚀 Synchronizing Authentication Users...');
  let pageToken;
  const usersToImport = [];

  do {
    const listUsersResult = await prodAuth.listUsers(1000, pageToken);
    listUsersResult.users.forEach(userRecord => usersToImport.push(userRecord));
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`Found ${usersToImport.length} users in Production Auth.`);
  
  if (usersToImport.length > 0) {
    let successCount = 0;
    for (const u of usersToImport) {
        try {
            await localAuth.createUser({
                uid: u.uid,
                email: u.email,
                // Setting a default password so you can actually login locally without knowing their real password
                password: 'password123', 
                displayName: u.displayName,
                emailVerified: u.emailVerified
            });
            successCount++;
        } catch(e) {
            if(e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') {
               console.error(`Error importing ${u.email}:`, e.message);
            }
        }
    }
    console.log(`✅ Successfully mirrored ${successCount} auth users to emulator.`);
    console.log(`🔑 IMPORTANT: You can now log into ANY of these accounts in your local app using the password: password123`);
  }
}

syncAuth().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
