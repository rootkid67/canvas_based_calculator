import { describe, expect, it } from 'vitest'
import { evaluateCalculatorInput } from './arithmetic'

describe('evaluateCalculatorInput', () => {
  it.each([
    ['2 + 3', '5'],
    ['8 - 3 - 2', '3'],
    ['2 + 3 × 4', '14'],
    ['(2 + 3) × 4', '20'],
    ['2(3 + 4)', '14'],
    ['-2 × -3', '6'],
    ['7 ÷ 2', '3.5'],
    ['.5 + 1.', '1.5'],
    ['1.25 × .4', '0.5'],
    ['1 + 2 = 3', '3'],
  ])('evaluates %s as %s', (expression, answer) => {
    expect(evaluateCalculatorInput(expression)).toBe(answer)
  })

  it.each(['1 ÷ 0', '4 ÷ (2 - 2)', '1 +', '(2 + 3', '2 + 3)', '1e3', '2 ** 3', '']) (
    'rejects invalid or unsafe expression %s',
    (expression) => expect(evaluateCalculatorInput(expression)).toBeUndefined(),
  )

  it('rejects results that overflow to infinity', () => {
    expect(evaluateCalculatorInput(`${'9'.repeat(200)} × ${'9'.repeat(200)}`))
      .toBeUndefined()
  })

})
