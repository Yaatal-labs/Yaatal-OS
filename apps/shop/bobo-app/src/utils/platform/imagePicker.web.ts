/**
 * Image Picker - Web Implementation
 * Uses HTML file input and Canvas API for web
 */

export interface ImagePickerResult {
  uri: string
  base64?: string
  width?: number
  height?: number
  fileSize?: number
  duration?: number
}

/**
 * Helper: Convert File to base64 string
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      // Remove data:image/jpeg;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
  })
}

/**
 * Helper: Get image dimensions
 */
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
  })
}

/**
 * Helper: Get video duration
 */
const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Math.round(video.duration))
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load video metadata'))
    }
    video.src = url
  })
}

/**
 * Helper: Create hidden file input and trigger click
 */
const createFileInput = (accept: string): Promise<File | null> => {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'

    input.onchange = (e) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      resolve(file || null)
    }

    // Cleanup
    input.onclick = () => {
      setTimeout(() => input.remove(), 0)
    }

    document.body.appendChild(input)
    input.click()
  })
}

/**
 * Pick image from device library
 */
export const pickImage = async (options: {
  allowsEditing?: boolean
  quality?: number
  base64?: boolean
}): Promise<ImagePickerResult | null> => {
  try {
    const file = await createFileInput('image/*')
    if (!file) return null

    const uri = URL.createObjectURL(file)
    const result: ImagePickerResult = {
      uri,
      fileSize: file.size,
    }

    // Get dimensions
    try {
      const dimensions = await getImageDimensions(file)
      result.width = dimensions.width
      result.height = dimensions.height
    } catch {
      console.warn('Could not determine image dimensions')
    }

    // Get base64 if requested
    if (options.base64) {
      try {
        result.base64 = await fileToBase64(file)
      } catch {
        console.warn('Could not encode image to base64')
      }
    }

    return result
  } catch (error) {
    console.error('Image picker error:', error)
    throw new Error('Failed to pick image')
  }
}

/**
 * Pick video from device library
 * Validates: 50MB max, 2min (120s) max duration by default
 */
export const pickVideo = async (options: {
  maxDuration?: number
  quality?: number
}): Promise<ImagePickerResult | null> => {
  try {
    const file = await createFileInput('video/*')
    if (!file) return null

    const maxDuration = options.maxDuration ?? 120 // 2 minutes default
    const maxFileSize = 50 * 1024 * 1024 // 50MB

    // Check file size
    if (file.size > maxFileSize) {
      throw new Error(`Video exceeds ${maxFileSize / (1024 * 1024)}MB limit`)
    }

    // Get duration
    let duration = 0
    try {
      duration = await getVideoDuration(file)
      if (duration > maxDuration) {
        throw new Error(`Video duration exceeds ${maxDuration}s limit`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('exceeds')) {
        throw error
      }
      console.warn('Could not determine video duration')
    }

    const uri = URL.createObjectURL(file)
    const result: ImagePickerResult = {
      uri,
      fileSize: file.size,
      duration,
    }

    // Get dimensions if possible
    try {
      const dimensions = await getImageDimensions(file)
      result.width = dimensions.width
      result.height = dimensions.height
    } catch {
      console.warn('Could not determine video dimensions')
    }

    return result
  } catch (error) {
    console.error('Video picker error:', error)
    throw error instanceof Error ? error : new Error('Failed to pick video')
  }
}

/**
 * Take photo using device camera (getUserMedia API)
 * Requires HTTPS or localhost
 */
export const takePhoto = async (options: {
  allowsEditing?: boolean
  quality?: number
  base64?: boolean
}): Promise<ImagePickerResult | null> => {
  try {
    // Check browser support
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access not supported in this browser')
    }

    // Request camera permission
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    // Create video element to capture stream
    const video = document.createElement('video')
    video.srcObject = stream
    video.style.display = 'none'
    document.body.appendChild(video)

    // Wait for video to load
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve
    })

    // Create canvas and capture frame
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get canvas context')
    }

    ctx.drawImage(video, 0, 0)

    // Stop stream
    stream.getTracks().forEach((track) => track.stop())
    video.remove()

    // Convert canvas to blob/data URL
    const uri = canvas.toDataURL('image/jpeg', options.quality ?? 0.8)

    const result: ImagePickerResult = {
      uri,
      width: canvas.width,
      height: canvas.height,
    }

    // Get base64 if requested
    if (options.base64) {
      result.base64 = uri.split(',')[1]
    }

    // Estimate file size
    result.fileSize = Math.round((uri.length * 0.75) / 1024) * 1024

    return result
  } catch (error) {
    console.error('Camera error:', error)
    throw error instanceof Error
      ? error
      : new Error('Failed to access camera')
  }
}
