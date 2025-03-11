const textareaInput = document.querySelector('#textareaInput')
const textareaResult = document.querySelector('#textareaResult')

textareaInput.addEventListener('keyup',(e) => {
    const objectJs = convertToJson(textareaInput.value)
    if(objectJs){
        const products = Object.values(objectJs)
        const slugs = []
        for(const product of products){
            slugs.push(product['model_name'])
        }
        textareaResult.innerHTML = JSON.stringify([...new Set(slugs)])
    }
})

function convertToJson (phpStr) {
    if (!phpStr.trim()) {
        return;
    }

    const cleanInput = (input) => {
        let cleaned = input
          .replace(/\r\n/g, '\n')
          .replace(/<\?(?:php)?|\?>/g, '')
          .trim();

        const arrayRegex = /\$\w+\s*=\s*(\[[\s\S]*\]|\barray\s*\([\s\S]*\))\s*;?/;
        const match = cleaned.match(arrayRegex);
        if (match) {
            cleaned = match[1].trim();
        } else {
          const arrayOnlyRegex = /^\s*(\[[\s\S]*\]|\barray\s*\([\s\S]*\))\s*;?\s*$/;
          const arrayMatch = cleaned.match(arrayOnlyRegex);
          if (arrayMatch) {
            cleaned = arrayMatch[1].trim();
          }
        }

        if (cleaned.startsWith('array(')) {
          cleaned = cleaned
            .replace(/^array\s*\(\s*/, '[')
            .replace(/\s*\)\s*$/, ']');
        }

        if (!cleaned.startsWith('[') && !cleaned.startsWith('{')) {
          cleaned = `[${cleaned}]`;
        }

        return cleaned;
      };

      const cleanedInput = cleanInput(phpStr);
      if (!cleanedInput) {
        return;
      }

      // Process the array structure
      const processedArray = processArray(cleanedInput);

      // Final cleanup and conversion
      const jsonStr = processedArray
        // Clean up any remaining whitespace
        .replace(/\s+/g, ' ')
        // Convert PHP null to JSON null
        .replace(/\bnull\b/g, 'null')
        // Convert PHP true/false to JSON true/false
        .replace(/\btrue\b/g, 'true')
        .replace(/\bfalse\b/g, 'false');

      // Parse and stringify to validate and format
      const jsonObj = JSON.parse(jsonStr);
      return jsonObj
};

function processArray (input) {
    if (input.trim() === '[]' || input.trim() === 'array()') {
      return '[]';
    }
    
    let content = input;

    if (content.startsWith('array(')) {
      content = content
        .replace(/^array\s*\(\s*/, '[')
        .replace(/\s*\)\s*$/, ']');
    }



    const match = content.match(/^\[([\s\S]*)\]$/);
    if (!match) {
      throw new Error('Invalid array syntax');
    }

    content = match[1].trim();
    if (!content) return '[]';

    // Split into tokens and process them
    const tokens = tokenize(content);
    // Process each token
    const processed = tokens.map((token, index) => {

      // Find arrow operator position
      const arrowPos = findArrowOperator(token);

      // Handle key => value pairs
      if (arrowPos !== -1) {
        const key = token.slice(0, arrowPos).trim();
        const value = token.slice(arrowPos + 2).trim();

        // Process both key and value
        const processedKey = processValue(key, true);
        const processedValue = value.includes('array(') || value.startsWith('[') 
          ? processArray(value)
          : processValue(value);

        return `${processedKey}:${processedValue}`;
      }

      // Handle nested arrays
      if (token.includes('array(') || token.startsWith('[')) {
        return processArray(token);
      }

      // Handle simple values
      return processValue(token);
    });


    // Determine if it's an object or array based on presence of key => value pairs
    const isObject = tokens.some(token => findArrowOperator(token) !== -1);

    return isObject ? `{${processed.join(',')}}` : `[${processed.join(',')}]`;
};

function tokenize (input) {
    const tokens = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';

    const addToken = (token) => {
      const trimmed = token.trim();
      if (trimmed) {
        tokens.push(trimmed);
      }
    };

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const nextChar = input[i + 1];

      // Handle string literals and track nested structures
      const newState = handleStringState(char, { inString, stringChar }, input, i);
      inString = newState.inString;
      stringChar = newState.stringChar;

      // Track nested structures and handle operators when not in string
      if (!inString) {
        if (char === '[' || char === '{' || char === '(') depth++;
        if (char === ']' || char === '}' || char === ')') depth--;

        // Split on commas at top level only
        if (char === ',' && depth === 0) {
          addToken(current);
          current = '';
          continue;
        }

        // Handle arrow operator
        if (char === '=' && nextChar === '>') {
          current += '=>';
          i++; // Skip next character
          continue;
        }
      }

      // Always add the current character
      current += char;
    }

    // Add the final token
    addToken(current);

    return tokens;
  };

function handleStringState(char,currentState,str, pos) {
    if (char === '"' || char === "'") {
      const escapeCount = countBackslashes(str, pos);
      if (escapeCount % 2 === 0) {
        if (!currentState.inString) {
          return { inString: true, stringChar: char };
        } else if (char === currentState.stringChar) {
          return { inString: false, stringChar: '' };
        }
      }
    }
    return currentState;
  };

   function countBackslashes (str, pos) {
    let count = 0;
    let i = pos - 1;
    while (i >= 0 && str[i] === '\\') {
      count++;
      i--;
    }
    return count;
  };

  function findArrowOperator (str) {
    let depth = 0;
    let state = { inString: false, stringChar: '' };
    
    for (let i = 0; i < str.length - 1; i++) {
      const char = str[i];
      const nextChar = str[i + 1];

      // Handle string literals
      state = handleStringState(char, state, str, i);
      if (char === '"' || char === "'") continue;

      // Only look for => when not in string and at base depth
      if (!state.inString) {
        if (char === '[' || char === '{' || char === '(') depth++;
        if (char === ']' || char === '}' || char === ')') depth--;
        if (depth === 0 && char === '=' && nextChar === '>') {
          return i;
        }
      }
    }
    return -1;
  };

  function processValue (value, isKey){
    value = value.trim();
    
    if (value === 'null') return 'null';
    if (value === 'true' || value === 'false') return value;
    if (/^-?\d+(\.\d+)?$/.test(value)) return isKey ? `"${value}"` : value;
    if (value.startsWith("'") || value.startsWith('"')) return processString(value);
    
    // Non-string keys need to be quoted
    return isKey ? `"${value}"` : value;
  };

  function processString (str){
    // Remove outer quotes
    const content = str.slice(1, -1);
    const delimiter = str[0];
    
    // Process escapes in multiple steps to avoid conflicts
    let processed = content;

    // Step 1: Temporarily encode escaped sequences
    const placeholders = {
      escapedDelimiter: '\u0000',
      escapedBackslash: '\u0001',
      escapedQuote: '\u0002',
      escapedNewline: '\u0003',
      escapedReturn: '\u0004',
      escapedTab: '\u0005'
    };

    // Replace escaped sequences with placeholders
    processed = processed
      .replace(new RegExp(`\\\\${delimiter}`, 'g'), placeholders.escapedDelimiter)
      .replace(/\\\\/g, placeholders.escapedBackslash)
      .replace(/\\'/g, placeholders.escapedQuote)
      .replace(/\\"/g, placeholders.escapedQuote)
      .replace(/\\n/g, placeholders.escapedNewline)
      .replace(/\\r/g, placeholders.escapedReturn)
      .replace(/\\t/g, placeholders.escapedTab);

    // Step 2: Restore escaped sequences in the correct order
    processed = processed
      .replace(new RegExp(placeholders.escapedDelimiter, 'g'), delimiter)
      .replace(new RegExp(placeholders.escapedBackslash, 'g'), '\\')
      .replace(new RegExp(placeholders.escapedQuote, 'g'), delimiter === '"' ? '\\"' : "'")
      .replace(new RegExp(placeholders.escapedNewline, 'g'), '\n')
      .replace(new RegExp(placeholders.escapedReturn, 'g'), '\r')
      .replace(new RegExp(placeholders.escapedTab, 'g'), '\t');

    // Let JSON.stringify handle the final escaping
    return JSON.stringify(processed);
  };