const { Mask, getMaskedObject } = require('../../src/payload-tagging/mask')

describe('Masking', () => {
  function expectMask (maskString, object, expectMasked) {
    const mask = new Mask(maskString)
    const masked = getMaskedObject(mask, object)
    expect(masked).to.deep.equal(expectMasked)
  }

  it('should take everything with glob mask', () =>
    expectMask(
      '*',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 }
    )
  )

  it('should exclude paths when excluding', () =>
    expectMask(
      '*,-foo.bar,-foo.quux',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { foo: { baz: 10 }, bar: 3 }
    )
  )

  it('should only provide included paths when including', () =>
    expectMask(
      'foo.bar,foo.quux',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { foo: { bar: 1, quux: 2 } })
  )

  it('should remove an entire section if given a partial path', () =>
    expectMask(
      '*,-foo',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { bar: 3 })
  )

  it('should include an entire section if given a partial path', () =>
    expectMask(
      'foo',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { foo: { bar: 1, baz: 10, quux: 2 } })
  )

  it('should remove specific excludes from an include path', () =>
    expectMask(
      'foo,-foo.bar',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { foo: { quux: 2, baz: 10 } })
  )

  it('should add specific includes from an exclude path', () =>
    expectMask(
      '*,-foo,foo.bar',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { bar: 3, foo: { bar: 1 } })
  )

  it('should accept globs in exclude paths', () =>
    expectMask(
      '*,-bar,-*.bar',
      { foo: { bar: 1, quux: 2, baz: 10 }, bar: 3 },
      { foo: { quux: 2, baz: 10 } })
  )

  it('should unescape `,` and `.` in mask input', () =>
    expectMask(
      'comma\\,key,-comma\\,key.period\\.key',
      {
        'comma,key': {
          'period.key': 1,
          regularKey: 2,
          another: 3
        },
        foo: [1, 2, 3]
      },
      { 'comma,key': { regularKey: 2, another: 3 } })
  )

  it('should handle non-toplevel globs on arrays', () =>
    expectMask(
      'objects,-objects.arr.*.val',
      {
        objects: {
          foo: 1,
          bar: 2,
          arr: [{ key: 1, val: 1 }, { key: 2, val: 2 }]
        }
      },
      { objects: { foo: 1, bar: 2, arr: [{ key: 1 }, { key: 2 }] } }
    )
  )

  it('should handle non-toplevel globs on objects', () =>
    expectMask(
      'objects,-objects.arr.*.val',
      {
        objects: {
          foo: 1,
          bar: 2,
          arr: {
            foo: { key: 1, val: 1 },
            bar: { key: 2, val: 2 }
          }
        }
      },
      { objects: { foo: 1, bar: 2, arr: { foo: { key: 1 }, bar: { key: 2 } } } }
    )
  )
})
