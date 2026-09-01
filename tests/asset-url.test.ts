import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../src/public-asset-url'

describe('publicAssetUrl', () => {
  it('preserves a GitHub Pages project subpath instead of resolving at origin root', () => {
    expect(
      publicAssetUrl('keywords/good-faith-payment.wav', 'https://hungson175.github.io/in-writing-webmcp/'),
    ).toBe('https://hungson175.github.io/in-writing-webmcp/keywords/good-faith-payment.wav')
  })

  it('resolves the same asset from the local root', () => {
    expect(publicAssetUrl('keywords/good-faith-payment.wav', 'http://127.0.0.1:4317/')).toBe(
      'http://127.0.0.1:4317/keywords/good-faith-payment.wav',
    )
  })
})
