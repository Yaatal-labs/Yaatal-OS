// Jest setup file for global test configuration

// Mock expo modules (with try-catch to handle missing modules during coverage collection)
try {
  jest.mock('expo-speech', () => ({
    speak: jest.fn(),
  }));
} catch (e) {
  // Ignore
}

try {
  jest.mock('expo-av', () => ({
    Audio: {
      requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
      setAudioModeAsync: jest.fn(() => Promise.resolve()),
      Recording: jest.fn(() => ({
        prepareToRecordAsync: jest.fn(() => Promise.resolve()),
        startAsync: jest.fn(() => Promise.resolve()),
        stopAndUnloadAsync: jest.fn(() => Promise.resolve()),
        getURI: jest.fn(() => 'file:///audio.wav'),
      })),
      RecordingOptionsPresets: {
        HIGH_QUALITY: {},
      },
    },
  }));
} catch (e) {
  // Ignore
}

try {
  jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest.fn(() =>
      Promise.resolve({ status: 'granted' })
    ),
    requestCameraPermissionsAsync: jest.fn(() =>
      Promise.resolve({ status: 'granted' })
    ),
    launchImageLibraryAsync: jest.fn(() =>
      Promise.resolve({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      })
    ),
    launchCameraAsync: jest.fn(() =>
      Promise.resolve({
        canceled: false,
        assets: [
          {
            uri: 'file:///camera.jpg',
            base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      })
    ),
    MediaTypeOptions: {
      Images: 'images',
    },
  }));
} catch (e) {
  // Ignore
}

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));
