# BOBO App Setup Instructions

## Prerequisites
- Node.js 18+ installed
- Expo CLI installed: `npm install -g expo-cli`
- Git installed
- DigitalOcean account (for PocketBase hosting)

## Step 1: Initialize React Native Project

```bash
# Create new Expo project with TypeScript
npx create-expo-app@latest bobo-app --template blank-typescript

cd bobo-app

# Install dependencies
npm install
```

## Step 2: Install All Dependencies

```bash
# Navigation
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context

# State Management
npm install zustand

# PocketBase
npm install pocketbase

# Storage
npm install @react-native-async-storage/async-storage

# QR Code
npm install react-native-qrcode-svg react-native-svg

# QR Scanner
npm install react-native-camera
npm install react-native-permissions

# Image/Video Picker
npm install react-native-image-picker

# Video Player
npm install react-native-video

# Chat
npm install react-native-gifted-chat
npm install react-native-audio-recorder-player

# UI Components
npm install react-native-vector-icons

# Utilities
npm install react-native-image-resizer
npm install dayjs
```

## Step 3: Copy Files from This Directory

After installing dependencies, copy all files from this bobo-app directory to your project:

```bash
# Copy src folder
cp -r src/ <your-bobo-app-path>/

# Copy configuration files
cp tsconfig.json app.json <your-bobo-app-path>/
```

## Step 4: Deploy PocketBase

1. **Create DigitalOcean Droplet:**
   - Go to https://digitalocean.com
   - Create Regular Droplet: 2GB RAM, 50GB SSD ($12/month)
   - Choose Ubuntu 22.04
   - Region: Amsterdam (closest to Dakar)

2. **SSH into droplet:**
   ```bash
   ssh root@your-droplet-ip
   ```

3. **Install PocketBase:**
   ```bash
   # Download PocketBase
   wget https://github.com/pocketbase/pocketbase/releases/download/v0.20.0/pocketbase_0.20.0_linux_amd64.zip

   # Unzip
   unzip pocketbase_0.20.0_linux_amd64.zip

   # Create directory
   mkdir /opt/pocketbase
   mv pocketbase /opt/pocketbase/
   cd /opt/pocketbase

   # Start PocketBase
   ./pocketbase serve --http="0.0.0.0:8090"
   ```

4. **Access PocketBase Admin:**
   - Open browser: http://your-droplet-ip:8090/_/
   - Create admin account
   - Import schema from `pocketbase_schema.json`

5. **Set up domain (optional but recommended):**
   - Point subdomain to droplet IP: `pb.bobo.app`
   - Install Nginx + SSL (Let's Encrypt)

## Step 5: Configure Environment Variables

Create `.env` file in project root:

```env
EXPO_PUBLIC_POCKETBASE_URL=http://your-droplet-ip:8090
EXPO_PUBLIC_APP_URL=bobo://
```

## Step 6: Run the App

```bash
# Start Metro bundler
npx expo start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on physical device
# Scan QR code with Expo Go app
```

## Step 7: Test Basic Flow

1. Sign up as merchant
2. Add a product with photo
3. Generate QR code
4. Sign up as customer (different account)
5. Scan QR code
6. View product detail

## Troubleshooting

### Camera permissions not working
```bash
# iOS: Add to Info.plist
<key>NSCameraUsageDescription</key>
<string>BOBO needs camera access to scan QR codes</string>

# Android: Add to AndroidManifest.xml
<uses-permission android:name="android.permission.CAMERA" />
```

### PocketBase connection issues
- Check firewall allows port 8090
- Verify EXPO_PUBLIC_POCKETBASE_URL is correct
- Check PocketBase is running: `ps aux | grep pocketbase`

### Build errors
```bash
# Clear cache
npx expo start --clear

# Reinstall dependencies
rm -rf node_modules
npm install
```

## Next Steps

Once basic setup is working:
1. Test all screens on physical device
2. Configure payment integration (when DEXCHANGE access ready)
3. Set up push notifications (Firebase)
4. Build production APK/IPA
5. Submit to TestFlight + Google Play Internal Testing

---

**Need help? Check the main README.md for detailed implementation guide.**
