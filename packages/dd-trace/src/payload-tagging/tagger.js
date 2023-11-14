const {
  PAYLOAD_TAG_REQUEST_PREFIX: PAYLOAD_REQUEST_PREFIX,
  PAYLOAD_TAG_RESPONSE_PREFIX: PAYLOAD_RESPONSE_PREFIX,
  PAYLOAD_TAGGING_MAX_TAGS
} = require('../constants')

const redactedKeys = [
  'authorization', 'x-authorization', 'password', 'token'
]
const truncated = 'truncated'
const redacted = 'redacted'

function escapeKey (key) {
  return key.replaceAll('.', '\\.')
}

function isJSONContentType (contentType) {
  return contentType && typeof contentType === 'string' && contentType.slice(-4) === 'json'
}

/**
 * Compute normalized payload tags from any given object.
 *
 * @param {object} object
 * @param {import('./mask').Mask} mask
 * @param {number} maxDepth
 * @param {string} prefix
 * @returns
 */
function tagsFromObject (object, mask, maxDepth, prefix) {
  let tagCount = 0
  const result = {}

  function tagRec (prefix, object, maskHead = mask.getHead(), depth = 0) {
    // Off by one: _dd.payload_tags_trimmed counts as 1 tag
    if (tagCount >= PAYLOAD_TAGGING_MAX_TAGS - 1) {
      result['_dd.payload_tags_trimmed'] = true
      return
    }

    if (depth >= maxDepth && typeof object === 'object') {
      result[prefix] = truncated
      tagCount += 1
      return
    } else {
      depth += 1
    }

    if (object === null) {
      result[prefix] = 'null'
      tagCount += 1
      return
    }

    if (typeof object === 'number' || typeof object === 'boolean') {
      result[prefix] = object.toString()
      tagCount += 1
      return
    }

    if (typeof object === 'string') {
      const lastKey = prefix.split('.').pop()
      result[prefix] = redactedKeys.includes(lastKey) ? redacted : object.substring(0, 5000)
      tagCount += 1
      return
    }

    if (typeof object === 'object') {
      for (const [key, value] of Object.entries(object)) {
        const isLastKey = !(typeof value === 'object')
        if (!maskHead.canTag(key, isLastKey)) continue
        tagRec(`${prefix}.${escapeKey(key)}`, value, maskHead.withNext(key), depth)
      }
    }
  }
  tagRec(prefix, object)
  return result
}

function getBodyTags (jsonString, contentType, opts) {
  const {
    filter,
    maxDepth,
    prefix = ''
  } = opts
  if (!isJSONContentType(contentType)) {
    return {}
  }
  let object
  try {
    object = JSON.parse(jsonString)
  } catch (err) {
    return {}
  }

  return tagsFromObject(object, filter, maxDepth, prefix)
}

function getBodyRequestTags (jsonString, contentType, opts) {
  return getBodyTags(jsonString, contentType, { ...opts, prefix: PAYLOAD_REQUEST_PREFIX })
}

function getBodyResponseTags (jsonString, contentType, opts) {
  return getBodyTags(jsonString, contentType, { ...opts, prefix: PAYLOAD_RESPONSE_PREFIX })
}

module.exports = {
  tagsFromObject,
  getBodyTags,
  getBodyRequestTags,
  getBodyResponseTags,
  isJSONContentType
}
