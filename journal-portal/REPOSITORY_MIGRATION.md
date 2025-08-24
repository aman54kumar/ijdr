# 🔄 Repository Migration Guide

## Current Situation

Your `aman54kumar/ijdr` repository currently has:

```
ijdr/
├── backend/     # Django backend (to be removed)
├── frontend/    # Angular app (to be moved to root)
└── other files
```

## Target Structure

We want to move all frontend files to the root:

```
ijdr/
├── src/                    # Angular app source
├── firebase.json           # Firebase configuration
├── package.json            # Dependencies
├── README.md              # Project documentation
└── all other frontend files
```

## Migration Steps

### Option 1: Git Commands (Preserves History)

```bash
# 1. Navigate to your repository
cd path/to/ijdr

# 2. Move frontend files to root (preserving history)
git mv frontend/* .
git mv frontend/.* . 2>/dev/null || true

# 3. Remove empty frontend directory
git rm -r frontend/

# 4. Remove backend directory
git rm -r backend/

# 5. Commit changes
git add .
git commit -m "Migrate to frontend-only repository structure"

# 6. Push changes
git push origin main
```

### Option 2: Fresh Repository (Clean History)

```bash
# 1. Create backup of current repo
cd parent/directory
cp -r ijdr ijdr-backup

# 2. Remove old content from ijdr
cd ijdr
rm -rf backend/ frontend/
rm -f other-unnecessary-files

# 3. Copy clean frontend files
cp -r /path/to/clean/journal-portal/* .
cp -r /path/to/clean/journal-portal/.* . 2>/dev/null || true

# 4. Initialize git if needed
git add .
git commit -m "Clean repository with Firebase-hosted frontend only"
git push origin main --force
```

## Files to Copy from Clean Project

✅ **Essential Files:**

- `src/` - Angular application
- `package.json` & `package-lock.json` - Dependencies
- `angular.json` - Angular configuration
- `tsconfig*.json` - TypeScript configuration
- `firebase.json` - Firebase hosting config
- `firestore.rules` & `storage.rules` - Firebase security
- `README.md` - Updated documentation
- `.gitignore` - Clean ignore rules

✅ **Utility Files:**

- `scripts/check-firebase-config.js` - Firebase debugging
- `CUSTOM_DOMAIN_SETUP.md` - Domain setup guide
- `.github/workflows/` - CI/CD automation

❌ **Don't Copy:**

- `node_modules/` - Will be installed via npm
- `dist/` - Build artifacts
- `.angular/cache` - Build cache
- Any Docker or server-related files

## After Migration

1. **Test locally:**

   ```bash
   npm install
   ng serve
   ```

2. **Deploy to Firebase:**

   ```bash
   ng build --configuration production
   firebase deploy --only hosting
   ```

3. **Verify website:**
   - Visit: https://ijdrpub.in
   - Test admin login
   - Check all features work

## Privacy & Security Checklist

✅ **Remove sensitive data:**

- No hardcoded credentials
- Firebase config is safe (contains only public API keys)
- No environment secrets in repository

✅ **Clean commit history:**

- Remove any commits with sensitive data
- Use `git filter-branch` if needed to clean history

✅ **Secure repository:**

- Set repository to private if needed
- Review collaborator access
- Enable branch protection rules

## GitHub Actions Setup

The clean project includes:

- ✅ Automatic deployment on push to main
- ✅ Preview deployments for pull requests
- ✅ Node.js 18 environment
- ✅ Firebase hosting integration

**Note:** You'll need to add `FIREBASE_SERVICE_ACCOUNT_IJDR_E41D4` secret in GitHub repository settings for CI/CD to work.

---

**🎯 Goal:** Transform from full-stack repository to clean, production-ready Firebase frontend repository.
