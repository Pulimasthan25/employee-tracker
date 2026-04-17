const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('\n❌ ERROR: Could not find service-account.json!');
  console.error('Please download it from Firebase Console -> Project Settings -> Service Accounts,');
  console.error('and place it in the root "employee-tracker" folder as "service-account.json".\n');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

console.log('🔄 Connecting to Production Database...');
const prodApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
}, 'prod');

const prodDb = prodApp.firestore();

// Point Admin SDK to local emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';

console.log('🔄 Connecting to Local Emulator (localhost:8081)...');
const localApp = admin.initializeApp({
  projectId: serviceAccount.project_id
}, 'local');

const localDb = localApp.firestore();

async function copyCollection(collectionRef) {
  const collectionName = collectionRef.id;
  console.log(`📦 Copying collection: '${collectionName}' (Fetching max 200 documents)...`);
  
  // VERY IMPORTANT: Limit the query to save quota!
  const snapshot = await prodDb.collection(collectionName).limit(200).get();
  
  if (snapshot.empty) {
    console.log(`   └─ No documents found.`);
    return;
  }

  let count = 0;
  // Use batched writes for faster imports
  const batches = [];
  let currentBatch = localDb.batch();
  let operationCount = 0;

  for (const doc of snapshot.docs) {
    const localDocRef = localDb.collection(collectionName).doc(doc.id);
    currentBatch.set(localDocRef, doc.data());
    operationCount++;
    count++;

    // FireStore batch limit is 500
    if (operationCount === 450) {
      batches.push(currentBatch.commit());
      currentBatch = localDb.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    batches.push(currentBatch.commit());
  }

  await Promise.all(batches);
  console.log(`   └─ Successfully mirrored ${count} documents.`);
}

async function run() {
  try {
    const targetCollections = ['users', 'settings', 'organizations'];
    console.log(`\n🚀 Attempting to sync specific collections: ${targetCollections.join(', ')}...\n`);
    
    for (const collectionName of targetCollections) {
      await copyCollection(prodDb.collection(collectionName));
    }
    
    console.log('\n✅ Data synchronization complete!');
    console.log('You can now restart your emulators with the export flag to save this state permanently.');
  } catch (error) {
    console.error('\n❌ Error synchronizing data:', error);
  } finally {
    process.exit(0);
  }
}

run();
