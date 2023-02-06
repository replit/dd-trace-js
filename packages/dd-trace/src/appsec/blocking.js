'use strict'

const fs = require('fs')
let templateLoaded = false
let templateHtml, templateJson
function block ({ req, res, topSpan, abortController }) {
  let type
  let body

  // parse the Accept header, ex: Accept: text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8
  const accept = req.headers.accept && req.headers.accept.split(',').map((str) => str.split(';', 1)[0].trim())

  if (accept && accept.includes('text/html') && !accept.includes('application/json')) {
    type = 'text/html'
    body = templateHtml
  } else {
    type = 'application/json'
    body = templateJson
  }

  topSpan.addTags({
    'appsec.blocked': 'true'
  })

  res.statusCode = 403
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)

  if (abortController) {
    abortController.abort()
  }
}

function loadTemplates (config) {
  if (!templateLoaded) {
    templateHtml = fs.readFileSync(config.appsec.blockedTemplateHtml)
    templateJson = fs.readFileSync(config.appsec.blockedTemplateJson)
    templateLoaded = true
  }
}

async function loadTemplatesAsync (config) {
  if (!templateLoaded) {
    templateHtml = await fs.promises.readFile(config.appsec.blockedTemplateHtml)
    templateJson = await fs.promises.readFile(config.appsec.blockedTemplateJson)
    templateLoaded = true
  }
}

function resetTemplates () {
  templateLoaded = false
}

module.exports = {
  block, loadTemplates, loadTemplatesAsync, resetTemplates
}
