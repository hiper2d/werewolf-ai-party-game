# Free Tier API Keys Management

This directory contains scripts to manage the global API keys used by free tier users.

## Overview

Free tier users don't provide their own API keys. Instead, they use shared API keys stored in Firestore at:
```
/config/freeTierApiKeys
```

## Initial Setup

### Step 1: Initialize the Document

Run this command once to create the Firestore document:

```bash
npx ts-node scripts/init-free-tier-keys.ts
```

This creates a document with empty placeholders for all required API keys.

### Step 2: Add Your API Keys

You have two options:

#### Option A: Using Scripts (Recommended)

Update each key individually:

```bash
npx ts-node scripts/update-free-tier-key.ts OPENAI_API_KEY "sk-..."
npx ts-node scripts/update-free-tier-key.ts ANTHROPIC_API_KEY "sk-ant-..."
npx ts-node scripts/update-free-tier-key.ts GOOGLE_API_KEY "AIza..."
npx ts-node scripts/update-free-tier-key.ts DEEPSEEK_API_KEY "sk-..."
npx ts-node scripts/update-free-tier-key.ts MISTRAL_API_KEY "..."
npx ts-node scripts/update-free-tier-key.ts GROK_API_KEY "xai-..."
npx ts-node scripts/update-free-tier-key.ts MOONSHOT_API_KEY "sk-..."
```

#### Option B: Using Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database**
4. Find the `config` collection → `freeTierApiKeys` document
5. Click **Edit document**
6. Update the values in the `keys` map field

## Viewing Current Keys

To see which keys are configured (masked for security):

```bash
npx ts-node scripts/view-free-tier-keys.ts
```

Output example:
```
📋 Free Tier API Keys Status

═══════════════════════════════════════════════════════
✅ OPENAI_API_KEY          sk-proj-ab...xyz
✅ ANTHROPIC_API_KEY       sk-ant-api...xyz
❌ GOOGLE_API_KEY          (empty)
✅ DEEPSEEK_API_KEY        sk-12345...xyz
❌ MISTRAL_API_KEY         (empty)
✅ GROK_API_KEY            xai-ABC...xyz
✅ MOONSHOT_API_KEY        sk-moon...xyz
═══════════════════════════════════════════════════════

📊 Summary: 5/7 keys configured
```

## Supported API Keys

| Key Name | Provider | Required For Models |
|----------|----------|---------------------|
| `OPENAI_API_KEY` | OpenAI | GPT-5, GPT-5-mini |
| `ANTHROPIC_API_KEY` | Anthropic | Claude 4.5 Sonnet, Claude 4.5 Haiku |
| `GOOGLE_API_KEY` | Google | Gemini 2.5 Pro |
| `DEEPSEEK_API_KEY` | DeepSeek | DeepSeek Chat, DeepSeek Reasoner |
| `MISTRAL_API_KEY` | Mistral | Mistral Large, Mistral Medium, Magistral |
| `GROK_API_KEY` | xAI | Grok 4 |
| `MOONSHOT_API_KEY` | Moonshot AI | Kimi K2 |

## Security Best Practices

1. **Never commit API keys to git** - They are stored in Firestore only
2. **Use environment variables** for scripts if needed
3. **Regularly rotate keys** to maintain security
4. **Set up billing alerts** on your AI provider accounts
5. **Monitor usage** to detect abuse

## Firestore Security Rules

Make sure your Firestore security rules protect this document:

```javascript
match /config/freeTierApiKeys {
  // Only server-side can read/write
  allow read, write: if false;
}
```

This ensures the keys can only be accessed via server-side code (Firebase Admin SDK), not from client-side applications.

## Troubleshooting

### "Firestore is not initialized"
Make sure your Firebase configuration is correct in `firebase/server.ts` or `firebase/firebase-keys.js`.

### "Document does not exist"
Run the initialization script first:
```bash
npx ts-node scripts/init-free-tier-keys.ts
```

### Keys not working
1. Verify the key is correct in Firebase Console
2. Check that the provider's API key has not expired
3. Ensure the provider account has sufficient credits
4. Check the key has the necessary permissions for the models you're using

## Cost Management

Free tier users share your API keys, so monitor costs carefully:

1. **Set up billing alerts** on each AI provider platform
2. **Implement rate limiting** (future enhancement)
3. **Track usage per user** (future enhancement)
4. **Consider usage quotas** per free tier user per day/month
