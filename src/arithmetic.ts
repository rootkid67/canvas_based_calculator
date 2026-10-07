/** Safely evaluate the arithmetic syntax returned by handwriting recognition. */
export function evaluateCalculatorInput(input: string): string | undefined {
  const expression = input.split('=')[0].replace(/×/g, '*').replace(/÷/g, '/')
  const compact = expression.replace(/\s/g, '')
  const tokens = compact.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) ?? []
  if (!tokens.length || tokens.join('') !== compact) return undefined

  let index = 0
  function parseExpression(): number | undefined {
    let value = parseTerm()
    if (value === undefined) return undefined
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++]
      const next = parseTerm()
      if (next === undefined) return undefined
      value = operator === '+' ? value + next : value - next
    }
    return value
  }

  function parseTerm(): number | undefined {
    let value = parseUnary()
    if (value === undefined) return undefined
    while (tokens[index] === '*' || tokens[index] === '/' || tokens[index] === '(' || /^\d/.test(tokens[index] ?? '')) {
      const explicitOperator = tokens[index] === '*' || tokens[index] === '/'
      const operator = explicitOperator ? tokens[index++] : '*'
      const next = parseUnary()
      if (next === undefined || (operator === '/' && next === 0)) return undefined
      value = operator === '*' ? value * next : value / next
    }
    return value
  }

  function parseUnary(): number | undefined {
    const sign = tokens[index]
    if (sign === '+' || sign === '-') {
      index++
      const value = parseUnary()
      return value === undefined ? undefined : sign === '-' ? -value : value
    }
    return parsePrimary()
  }

  function parsePrimary(): number | undefined {
    if (tokens[index] === '(') {
      index++
      const value = parseExpression()
      if (value === undefined || tokens[index] !== ')') return undefined
      index++
      return value
    }
    const token = tokens[index] ?? ''
    const value = Number(token)
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) || !Number.isFinite(value)) return undefined
    index++
    return value
  }

  const value = parseExpression()
  if (value === undefined || index !== tokens.length || !Number.isFinite(value)) return undefined
  return Number(value.toPrecision(12)).toString()
}
