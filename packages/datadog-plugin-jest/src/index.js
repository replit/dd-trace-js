const CiPlugin = require('../../dd-trace/src/plugins/ci_plugin')
const { storage } = require('../../datadog-core')

const {
  TEST_STATUS,
  JEST_TEST_RUNNER,
  finishAllTraceSpans,
  getTestEnvironmentMetadata,
  getTestParentSpan,
  getTestSessionCommonTags,
  getTestSuiteCommonTags,
  TEST_PARAMETERS,
  getCodeOwnersFileEntries,
  TEST_SESSION_ID,
  TEST_SUITE_ID,
  TEST_COMMAND,
  TEST_ITR_TESTS_SKIPPED,
  TEST_CODE_COVERAGE_LINES_TOTAL
} = require('../../dd-trace/src/plugins/util/test')
const { COMPONENT } = require('../../dd-trace/src/constants')

class JestPlugin extends CiPlugin {
  static get name () {
    return 'jest'
  }

  constructor (...args) {
    super(...args)

    this.testEnvironmentMetadata = getTestEnvironmentMetadata('jest', this.config)
    this.codeOwnersEntries = getCodeOwnersFileEntries()

    this.addSub('ci:jest:session:start', (command) => {
      const store = storage.getStore()
      const childOf = getTestParentSpan(this.tracer)
      const testSessionSpanMetadata = getTestSessionCommonTags(command, this.tracer._version)

      const testSessionSpan = this.tracer.startSpan('jest.test_session', {
        childOf,
        tags: {
          [COMPONENT]: this.constructor.name,
          ...this.testEnvironmentMetadata,
          ...testSessionSpanMetadata
        }
      })
      this.enter(testSessionSpan, store)
    })

    this.addSub('ci:jest:session:finish', ({ status, isTestsSkipped, testCodeCoverageLinesTotal }) => {
      const testSessionSpan = storage.getStore().span
      testSessionSpan.setTag(TEST_STATUS, status)
      if (isTestsSkipped) {
        testSessionSpan.setTag(TEST_ITR_TESTS_SKIPPED, 'true')
      } else {
        testSessionSpan.setTag(TEST_ITR_TESTS_SKIPPED, 'false')
      }
      if (testCodeCoverageLinesTotal !== undefined) {
        testSessionSpan.setTag(TEST_CODE_COVERAGE_LINES_TOTAL, testCodeCoverageLinesTotal)
      }
      testSessionSpan.finish()
      finishAllTraceSpans(testSessionSpan)
      this.tracer._exporter.flush()
    })

    // Test suites can be run in a different process from jest's main one.
    // This subscriber changes the configuration objects from jest to inject the trace id
    // of the test session to the processes that run the test suites.
    this.addSub('ci:jest:session:configuration', configs => {
      const testSessionSpan = storage.getStore().span
      configs.forEach(config => {
        config._ddTestSessionId = testSessionSpan.context()._traceId.toString(10)
        config._ddTestCommand = testSessionSpan.context()._tags[TEST_COMMAND]
      })
    })

    this.addSub('ci:jest:test-suite:start', ({ testSuite, testEnvironmentOptions }) => {
      const { _ddTestSessionId: testSessionId, _ddTestCommand: testCommand } = testEnvironmentOptions

      const store = storage.getStore()

      const testSessionSpanContext = this.tracer.extract('text_map', {
        'x-datadog-trace-id': testSessionId,
        'x-datadog-parent-id': '0000000000000000'
      })

      const testSuiteMetadata = getTestSuiteCommonTags(testCommand, this.tracer._version, testSuite)

      const testSuiteSpan = this.tracer.startSpan('jest.test_suite', {
        childOf: testSessionSpanContext,
        tags: {
          [COMPONENT]: this.constructor.name,
          ...this.testEnvironmentMetadata,
          ...testSuiteMetadata
        }
      })
      this.enter(testSuiteSpan, store)
    })

    this.addSub('ci:jest:test-suite:finish', ({ status, errorMessage }) => {
      const testSuiteSpan = storage.getStore().span
      testSuiteSpan.setTag(TEST_STATUS, status)
      if (errorMessage) {
        testSuiteSpan.setTag('error', new Error(errorMessage))
      }
      testSuiteSpan.finish()
      // Suites potentially run in a different process than the session,
      // so calling finishAllTraceSpans on the session span is not enough
      finishAllTraceSpans(testSuiteSpan)
    })

    this.addSub('ci:jest:test-suite:code-coverage', (coverageFiles) => {
      if (!this.config.isIntelligentTestRunnerEnabled) {
        return
      }
      const testSuiteSpan = storage.getStore().span
      this.tracer._exporter.exportCoverage({ span: testSuiteSpan, coverageFiles })
    })

    this.addSub('ci:jest:test:start', (test) => {
      const store = storage.getStore()
      const span = this.startTestSpan(test)

      this.enter(span, store)
    })

    this.addSub('ci:jest:test:finish', (status) => {
      const span = storage.getStore().span
      span.setTag(TEST_STATUS, status)
      span.finish()
      finishAllTraceSpans(span)
    })

    this.addSub('ci:jest:test:err', (error) => {
      if (error) {
        const span = storage.getStore().span
        span.setTag(TEST_STATUS, 'fail')
        span.setTag('error', error)
      }
    })

    this.addSub('ci:jest:test:skip', (test) => {
      const span = this.startTestSpan(test)
      span.setTag(TEST_STATUS, 'skip')
      span.finish()
    })
  }

  startTestSpan (test) {
    const suiteTags = {}
    const store = storage.getStore()
    const testSuiteSpan = store ? store.span : undefined
    if (testSuiteSpan) {
      const testSuiteId = testSuiteSpan.context()._spanId.toString(10)
      suiteTags[TEST_SUITE_ID] = testSuiteId
      suiteTags[TEST_SESSION_ID] = testSuiteSpan.context()._traceId.toString(10)
      suiteTags[TEST_COMMAND] = testSuiteSpan.context()._tags[TEST_COMMAND]
    }

    const { suite, name, runner, testParameters } = test

    const extraTags = {
      [JEST_TEST_RUNNER]: runner,
      [TEST_PARAMETERS]: testParameters,
      ...suiteTags
    }

    return super.startTestSpan(name, suite, extraTags)
  }
}

module.exports = JestPlugin
