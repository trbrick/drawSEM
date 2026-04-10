// Converter function: converts LaTeX-style notation to Unicode with support for nested subscripts
// Examples:
//   \epsilon_{x1} -> ε_{x₁}
//   V_{e_{x1}} -> V_{ex₁} (nested subscripts collapsed to single depth)
//   \mu_{x2} -> μ_{x₂}
export function convertToUnicode(text: string): string {
  if (!text) return text

  // Greek letter mappings
  const greekMap: Record<string, string> = {
    '\\epsilon': 'ε',
    '\\varepsilon': 'ε',
    '\\mu': 'μ',
    '\\sigma': 'σ',
    '\\tau': 'τ',
    '\\phi': 'φ',
    '\\psi': 'ψ',
    '\\theta': 'θ',
    '\\lambda': 'λ',
    '\\gamma': 'γ',
    '\\delta': 'δ',
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\rho': 'ρ',
  }

  // Subscript digit mappings (0-9)
  const subscriptMap: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  }

  // Superscript mappings (0-9, +, -, =, ())
  const superscriptMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  }

  let result = text

  // Replace Greek letters
  for (const [latex, unicode] of Object.entries(greekMap)) {
    result = result.replaceAll(latex, unicode)
  }

  // Collapse nested subscripts: _{..._{...}...} -> _{...} (remove inner subscript markers)
  // Iterate until no more nested subscripts are found
  let prevResult = ''
  let iterations = 0
  while (result !== prevResult && iterations < 10) {
    prevResult = result
    // Match _{content_{inner}content} and replace with _{contentinnercontent}
    result = result.replace(/_\{([^{}]*)_\{([^{}]*)\}([^{}]*)\}/g, '_\{$1$2$3\}')
    iterations++
  }

  // Handle multi-character subscripts: _abc123 -> ₐᵦ𝒸₁₂₃ (all following alphanumeric chars become subscript)
  // Process these BEFORE braced subscripts so nested cases like _{x_1} work correctly
  result = result.replace(/_([a-zA-Z0-9]+)/g, (match, chars) => {
    return chars.split('').map((c: string) => subscriptMap[c] || c).join('')
  })

  // Convert subscripts: _{X...} where each character becomes subscript
  // Now the inner _X patterns have been converted, so we won't have nested underscores
  result = result.replace(/_\{([^}]+)\}/g, (match, content) => {
    return content.split('').map((c: string) => subscriptMap[c] || c).join('')
  })

  // Handle superscripts: ^X or ^{...} notation
  result = result.replace(/\^\{([^}]+)\}/g, (match, content) => {
    return '^' + content.split('').map((c: string) => superscriptMap[c] || c).join('')
  })
  result = result.replace(/\^([0-9+\-=()a-zA-Z])/g, (match, char) => {
    return '^' + (superscriptMap[char] || char)
  })

  return result
}
