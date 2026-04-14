const fs = require('fs');
const path = require('path');

const envConfigFile = `export const environment = {
  production: true,
  firebase: {
    apiKey: '${process.env.FIREBASE_API_KEY}',
    authDomain: '${process.env.FIREBASE_AUTH_DOMAIN}',
    projectId: '${process.env.FIREBASE_PROJECT_ID}',
    storageBucket: '${process.env.FIREBASE_STORAGE_BUCKET}',
    messagingSenderId: '${process.env.FIREBASE_MESSAGING_SENDER_ID}',
    appId: '${process.env.FIREBASE_APP_ID}'
  },
  supabase: {
    url: '${process.env.SUPABASE_URL || ''}',
    anonKey: '${process.env.SUPABASE_ANON_KEY || ''}',
    screenshotBucket: '${process.env.SCREENSHOT_BUCKET || process.env.SUPABASE_SCREENSHOT_BUCKET || 'screenshots'}'
  }
};
`;

const dirPath = path.join(__dirname, '../src/environments');
if (!fs.existsSync(dirPath)){
    fs.mkdirSync(dirPath, { recursive: true });
}

const targetPath = path.join(dirPath, 'environment.production.ts');

fs.writeFileSync(targetPath, envConfigFile);
console.log(`Generated ${targetPath} successfully.`);
