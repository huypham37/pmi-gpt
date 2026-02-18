// Re-export from shared so both main and renderer can use the same parser
export {
  parseSingleTestCase,
  parseTestCasesFromResponse,
  toTestCases,
  type ParsedTestCase,
} from '../../shared/testcase-parser'
