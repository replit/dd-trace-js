const { getBodyTags } = require('../../src/payload-tagging/tagger')
const { Mask } = require('../../src/payload-tagging/mask')

const globMask = new Mask('*')
const defaultOpts = { filter: globMask, maxDepth: 10, prefix: 'http.payload' }

describe('JSON payload tagger', () => {
  describe('tag count cutoff', () => {
    it('generate many tags when not reaching the cap', () => {
      const belowCap = 200
      const input = JSON.stringify({ foo: Object.fromEntries([...Array(belowCap).keys()].map(i => [i, i])) })
      const tagCount = Object.entries(getBodyTags(input, 'application/json', defaultOpts)).length
      expect(tagCount).to.equal(belowCap)
    })

    it('should stop generating tags once the cap is reached', () => {
      const aboveCap = 759
      const input = JSON.stringify({ foo: Object.fromEntries([...Array(aboveCap).keys()].map(i => [i, i])) })
      const tagCount = Object.entries(getBodyTags(input, 'application/json', defaultOpts)).length
      expect(tagCount).to.not.equal(aboveCap)
      expect(tagCount).to.equal(758)
    })
  })

  describe('content-type validation', () => {
    let parseSpy
    beforeEach(() => { parseSpy = sinon.spy(JSON, 'parse') })

    afterEach(() => { parseSpy.restore() })

    for (const invalidType of [null, undefined, '', 'application/yaml']) {
      it(`should not attempt parsing with invalid content-type "${invalidType}"`, () => {
        const input = JSON.stringify({ 'foo': { 'bar': { 'baz': 1, 'quux': 2 } } })
        const tags = getBodyTags(input, invalidType, defaultOpts)
        expect(tags).to.deep.equal({})
        expect(parseSpy).to.not.have.been.called
      })
    }

    for (const validType of [
      'application/json', 'application/foo+json', 'application/javastuff.json', 'application/legacy-json'
    ]) {
      it(`should parse with valid type ${validType}`, () => {
        const input = JSON.stringify({ 'foo': { 'bar': { 'baz': 1, 'quux': 2 } } })
        const tags = getBodyTags(input, validType, defaultOpts)
        expect(tags).to.not.deep.equal({})
        expect(parseSpy).to.have.been.called
      })
    }
  })

  describe('best-effort redacting of keys', () => {
    it('should redact disallowed keys', () => {
      const input = JSON.stringify({
        foo: {
          bar: {
            token: 'tokenpleaseredact',
            authorization: 'pleaseredact',
            valid: 'valid'
          },
          baz: {
            password: 'shouldgo',
            'x-authorization': 'shouldbegone',
            data: 'shouldstay'
          }
        }
      })
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({
        'http.payload.foo.bar.token': 'redacted',
        'http.payload.foo.bar.authorization': 'redacted',
        'http.payload.foo.bar.valid': 'valid',
        'http.payload.foo.baz.password': 'redacted',
        'http.payload.foo.baz.x-authorization': 'redacted',
        'http.payload.foo.baz.data': 'shouldstay'
      })
    })

    describe('escaping', () => {
      it('should escape `.` characters', () => {
        const input = JSON.stringify({ 'foo.bar': { 'baz': 'quux' } })
        const tags = getBodyTags(input, 'application/json', defaultOpts)
        expect(tags).to.deep.equal({
          'http.payload.foo\\.bar.baz': 'quux'
        })
      })
    })
  })

  describe('parsing', () => {
    it('should transform null values to "null" string', () => {
      const input = JSON.stringify({ 'foo': 'bar', 'baz': null })
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({
        'http.payload.foo': 'bar',
        'http.payload.baz': 'null'
      })
    })

    it('should transform boolean values to strings', () => {
      const input = JSON.stringify({ 'foo': true, 'bar': false })
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({
        'http.payload.foo': 'true',
        'http.payload.bar': 'false'
      })
    })

    it('should provide tags from simple JSON objects, casting to strings where necessary', () => {
      const input = JSON.stringify({
        'foo': { 'bar': { 'baz': 1, 'quux': 2 } },
        'asimplestring': 'isastring',
        'anullvalue': null
      })
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({
        'http.payload.foo.bar.baz': '1',
        'http.payload.foo.bar.quux': '2',
        'http.payload.asimplestring': 'isastring',
        'http.payload.anullvalue': 'null'
      })
    })

    it('should index tags when encountering arrays', () => {
      const input = JSON.stringify({ 'foo': { 'bar': { 'list': ['v0', 'v1', 'v2'] } } })
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({
        'http.payload.foo.bar.list.0': 'v0',
        'http.payload.foo.bar.list.1': 'v1',
        'http.payload.foo.bar.list.2': 'v2'
      })
    })

    it('should return no tags on invalid JSON string input', () => {
      const input = '{"invalid": "input"]'
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({})
    })

    it('should not replace a real value at max depth', () => {
      const input = JSON.stringify({
        1: { 2: { 3: { 4: { 5: { 6: { 7: { 8: { 9: { 10: 11 } } } } } } } } }
      })
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({ 'http.payload.1.2.3.4.5.6.7.8.9.10': '11' })
    })

    it('should truncate paths beyond max depth', () => {
      const input = JSON.stringify({
        1: { 2: { 3: { 4: { 5: { 6: { 7: { 8: { 9: { 10: { 11: 'too much' } } } } } } } } } }
      })
      const tags = getBodyTags(input, 'application/json', defaultOpts)
      expect(tags).to.deep.equal({ 'http.payload.1.2.3.4.5.6.7.8.9.10': 'truncated' })
    })
  })
})
