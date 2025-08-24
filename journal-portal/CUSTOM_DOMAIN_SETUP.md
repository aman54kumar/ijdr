# 🌐 Connect ijdrpub.in to Firebase Hosting

## Current Status

- ✅ **Domain**: ijdrpub.in (active with Hostinger)
- ✅ **App**: Live at https://ijdr-e41d4.web.app
- 🔄 **Goal**: Connect custom domain to Firebase app

## Step-by-Step Guide

### 1. Add Domain in Firebase Console

1. **Visit**: https://console.firebase.google.com/project/ijdr-e41d4/hosting/main
2. **Click**: "Add custom domain"
3. **Enter**: `ijdrpub.in`
4. **Select**: "Advanced setup" (to use both ijdrpub.in and www.ijdrpub.in)

### 2. Copy DNS Records from Firebase

Firebase will show you DNS records like:

```
Type: A
Name: @
Value: 151.101.1.195

Type: A
Name: @
Value: 151.101.65.195

Type: A
Name: www
Value: 151.101.1.195

Type: A
Name: www
Value: 151.101.65.195
```

**⚠️ Important**: Copy the EXACT IP addresses Firebase gives you (they may be different)

### 3. Update Hostinger DNS

1. **Login**: https://hpanel.hostinger.com/
2. **Navigate**: Domains → Manage → DNS Zone Editor for ijdrpub.in
3. **Delete**: All existing A records pointing to Hostinger
4. **Add**: The A records from Firebase (step 2)
5. **Save**: Changes

### 4. Verify in Firebase

1. **Return to**: Firebase Console
2. **Click**: "Verify" next to ijdrpub.in
3. **Wait**: 15 minutes to 2 hours for DNS propagation

### 5. Test Your Domain

Once verified:

- **Visit**: https://ijdrpub.in
- **Should show**: Your IJDR Portal (not Hostinger page)
- **SSL**: Automatic HTTPS certificate from Firebase

## Troubleshooting

### DNS Not Propagating?

- **Check**: https://dnschecker.org/#A/ijdrpub.in
- **Wait**: Up to 48 hours for global propagation

### Still Showing Hostinger Page?

- **Clear browser cache**
- **Try incognito/private mode**
- **Check DNS records are correct**

### SSL Issues?

- Firebase automatically provides SSL certificates
- May take 24 hours after domain verification

## Benefits After Setup

✅ **Professional URL**: https://ijdrpub.in  
✅ **Automatic SSL**: Secure HTTPS connection  
✅ **Global CDN**: Fast loading worldwide  
✅ **No server costs**: Firebase free tier  
✅ **Auto-scaling**: Handles any traffic

## Support Links

- **Firebase Console**: https://console.firebase.google.com/project/ijdr-e41d4
- **Hostinger Panel**: https://hpanel.hostinger.com/
- **DNS Checker**: https://dnschecker.org/#A/ijdrpub.in
