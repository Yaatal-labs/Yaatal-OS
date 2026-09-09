/**
 * Whether the BOBO buyer surface is being hosted by the OS shell.
 *
 * The caller supplies its platform and browser location so native rendering and
 * server-side/test environments never need to access a browser global.
 */
export const isEmbeddedWebGuestMode = (
  platform: string,
  location?: { search?: string },
): boolean => {
  if (platform !== 'web' || !location?.search) {
    return false
  }

  return new URLSearchParams(location.search).get('embedded') === '1'
}

export type RootNavigatorSurface =
  | 'auth'
  | 'merchant'
  | 'customer'
  | 'embedded-read-only'

/**
 * Choose the app surface without letting restored BOBO credentials escape the
 * OS shell's read-only boundary.
 */
export const selectRootNavigatorSurface = ({
  isAuthenticated,
  isMerchant,
  isEmbedded,
}: {
  isAuthenticated: boolean
  isMerchant: boolean
  isEmbedded: boolean
}): RootNavigatorSurface => {
  if (isEmbedded) {
    return 'embedded-read-only'
  }

  if (!isAuthenticated) {
    return 'auth'
  }

  return isMerchant ? 'merchant' : 'customer'
}
