import { isEmbeddedWebGuestMode } from '../navigation/embeddedWebGuestMode'

describe('isEmbeddedWebGuestMode', () => {
  it('enables the public buyer surface only for the embedded web query flag', () => {
    expect(isEmbeddedWebGuestMode('web', { search: '?embedded=1' })).toBe(true)
    expect(isEmbeddedWebGuestMode('web', { search: '?product=123&embedded=1' })).toBe(true)
  })

  it('does not enable embedded mode for standalone web URLs', () => {
    expect(isEmbeddedWebGuestMode('web', { search: '' })).toBe(false)
    expect(isEmbeddedWebGuestMode('web', { search: '?embedded=0' })).toBe(false)
    expect(isEmbeddedWebGuestMode('web', { search: '?embedded=1x' })).toBe(false)
  })

  it('does not enable embedded mode on native or without a browser location', () => {
    expect(isEmbeddedWebGuestMode('ios', { search: '?embedded=1' })).toBe(false)
    expect(isEmbeddedWebGuestMode('android', { search: '?embedded=1' })).toBe(false)
    expect(isEmbeddedWebGuestMode('web')).toBe(false)
  })
})
