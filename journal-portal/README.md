# 🌟 IJDR Journal Portal

A modern, Firebase-powered journal publication portal built with Angular 18.

## 🚀 Live Website

**Visit**: https://ijdrpub.in

## 📋 Features

- 🔐 **Secure Admin Panel** - Firebase Authentication
- 📚 **Journal Management** - Create, edit, and manage journal publications
- 📄 **Article Management** - Full article lifecycle management
- 🔄 **PDF Processing** - Upload and extract journal metadata
- 📱 **Responsive Design** - Works on all devices
- 🌍 **Global CDN** - Fast loading worldwide via Firebase
- 🔒 **SSL Secured** - Automatic HTTPS encryption

## 🛠 Tech Stack

- **Frontend**: Angular 18 with Bootstrap 5
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **Hosting**: Firebase Hosting
- **Build Tool**: Angular CLI
- **Styling**: SCSS with Bootstrap

## 📁 Project Structure

```
ijdr-journal-portal/
├── src/                    # Angular application source
│   ├── app/               # Main application components
│   ├── assets/            # Static assets
│   └── environments/      # Environment configurations
├── public/                # Public assets
├── scripts/               # Utility scripts
├── firebase.json          # Firebase configuration
├── firestore.rules        # Firestore security rules
├── storage.rules          # Firebase Storage security rules
└── package.json           # Dependencies and scripts
```

## 🔧 Development

### Prerequisites

- Node.js 18+
- Angular CLI
- Firebase CLI

### Setup

```bash
# Clone repository
git clone https://github.com/aman54kumar/ijdr.git
cd ijdr

# Install dependencies
npm install

# Start development server
ng serve
```

### Build

```bash
# Build for production
ng build --configuration production

# Deploy to Firebase
firebase deploy --only hosting
```

## 🔐 Admin Access

- **URL**: https://ijdrpub.in/login
- **Features**: Journal creation, article management, PDF processing
- **Security**: Firebase Authentication required

## 🌐 Firebase Configuration

The project uses Firebase for:

- **Authentication**: Secure admin login
- **Firestore**: Journal and article data storage
- **Storage**: PDF file management
- **Hosting**: Global CDN with automatic SSL

## 📖 Usage

1. **Public Access**: Browse journals and articles at https://ijdrpub.in
2. **Admin Access**: Login at https://ijdrpub.in/login for management features
3. **Content Management**: Upload journals, manage articles, process PDFs

## 🔍 Debugging

```bash
# Check Firebase configuration
node scripts/check-firebase-config.js

# View Firebase console
https://console.firebase.google.com/project/ijdr-e41d4
```

## 📝 License

This project is proprietary and confidential.

## 🤝 Contributing

This is a private project. For authorized contributors, please follow standard Git workflow.

---

**🌟 IJDR Journal Portal** - Empowering academic publishing with modern technology.
