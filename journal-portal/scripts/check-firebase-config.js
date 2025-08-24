#!/usr/bin/env node

/**
 * Firebase Configuration Checker
 * Helps validate that Firebase is properly configured
 */

const fs = require("fs");
const path = require("path");

console.log("🔥 Firebase Configuration Checker\n");

// Check if firebase-config.ts exists
const configPath = path.join(
  __dirname,
  "../src/environments/firebase-config.ts"
);

if (!fs.existsSync(configPath)) {
  console.error("❌ firebase-config.ts not found!");
  console.log("📍 Expected location: src/environments/firebase-config.ts");
  process.exit(1);
}

// Read the configuration file
const configContent = fs.readFileSync(configPath, "utf8");

// Check for placeholder values
const placeholders = [
  "YOUR_API_KEY_HERE",
  "your-project.firebaseapp.com",
  "your-project-id",
  "YOUR_SENDER_ID",
  "YOUR_APP_ID",
];

let hasPlaceholders = false;
placeholders.forEach((placeholder) => {
  if (configContent.includes(placeholder)) {
    hasPlaceholders = true;
    console.log(`⚠️  Found placeholder: ${placeholder}`);
  }
});

if (hasPlaceholders) {
  console.log("\n❌ Firebase configuration contains placeholder values!");
  console.log("\n📋 Next Steps:");
  console.log(
    "1. Create a Firebase project at https://console.firebase.google.com"
  );
  console.log("2. Enable Authentication (Email/Password)");
  console.log("3. Add a web app to get configuration");
  console.log("4. Replace placeholder values in firebase-config.ts");
  console.log("5. Run this script again to verify");
  console.log("\n📖 See FIREBASE_SETUP_GUIDE.md for detailed instructions");
} else {
  // Try to parse the configuration
  try {
    // Extract the configuration object (simple regex approach)
    const apiKeyMatch = configContent.match(/apiKey:\s*['"`]([^'"`]+)['"`]/);
    const projectIdMatch = configContent.match(
      /projectId:\s*['"`]([^'"`]+)['"`]/
    );
    const authDomainMatch = configContent.match(
      /authDomain:\s*['"`]([^'"`]+)['"`]/
    );

    if (apiKeyMatch && projectIdMatch && authDomainMatch) {
      console.log("✅ Firebase configuration appears to be properly set up!");
      console.log(`📍 Project ID: ${projectIdMatch[1]}`);
      console.log(`🌐 Auth Domain: ${authDomainMatch[1]}`);
      console.log(`🔑 API Key: ${apiKeyMatch[1].substring(0, 10)}...`);

      console.log("\n🎯 Next Steps:");
      console.log("1. Make sure Authentication is enabled in Firebase Console");
      console.log("2. Create Firestore database");
      console.log("3. Set up Storage");
      console.log("4. Test the login functionality");
    } else {
      console.log("⚠️  Could not parse Firebase configuration");
      console.log("Please check the format in firebase-config.ts");
    }
  } catch (error) {
    console.error("❌ Error checking configuration:", error.message);
  }
}

console.log("\n🔗 Helpful Links:");
console.log("• Firebase Console: https://console.firebase.google.com");
console.log("• Documentation: https://firebase.google.com/docs/web/setup");
console.log("• Setup Guide: ./FIREBASE_SETUP_GUIDE.md");
