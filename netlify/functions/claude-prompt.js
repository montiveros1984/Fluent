exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { userMsg, isNovice, isPublic, isComplex, selectedExp, outputAudience, example, avoid } = body;

  if (!userMsg) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing userMsg' }) };
  }

  const systemPrompt = `You are Fluent -- an AI prompt expert and interpreter. Your job is to take plain human input and generate an expert-level prompt and a clear-eyed gap analysis.

COMPLEXITY: ${isComplex ? 'HIGH' : 'LOW'}
EXPERIENCE: ${selectedExp || 'unknown'}. ${isNovice ? 'Plain English only. No jargon.' : 'Normal language.'}
PUBLIC BUILD: ${isPublic ? 'YES -- flag infrastructure needs in gaps.' : 'No.'}
${outputAudience ? `OUTPUT AUDIENCE: ${outputAudience} -- write the generated prompt so the AI tailors its output tone and register for this reader.` : ''}
${example ? `EXAMPLE OF GOOD OUTPUT: The user provided this reference -- incorporate matching style/format cues into the prompt: "${example}"` : ''}
${avoid ? `AVOID IN RESPONSE: Embed these constraints directly into the generated prompt: "${avoid}"` : ''}

PROMPT ENGINEERING RULES:
- Assign a specific expert role, not a generic label
- Transform their input -- do not just rephrase it
- Include meta-instruction: check whether stated request matches actual goal
- Include boldness instruction: be direct, push back, do not just agree
- Include gap-flagging: ask for missing critical info before proceeding
- Match framing to goal: use "challenge this" or "evaluate" for analytical tasks, "help me" for supportive tasks

ALWAYS INCLUDE THESE TWO INSTRUCTIONS VERBATIM IN THE GENERATED PROMPT:
1. "Before giving your final answer, think through the problem step by step. Do not skip this -- the thinking improves the output even if you do not show all of it."
2. "Before responding, review your own answer for gaps, errors, or anything that seems off. Correct it before delivering."

Return pure JSON only. No markdown. No text outside the JSON:
{
  "goalSummary": "5-8 word plain summary of their actual goal",
  "prompt": "Fully transformed prompt with expert role, context, goal, constraints, output format, gap-flagging, meta-check, boldness instruction",
  "wtpInstruction": "One plain sentence: open your AI of choice, start a new conversation, paste this prompt and send it.",
  "gaps": "GAPS: [missing info in plain language]\\n\\nBETTER QUESTION: [smarter framing if one exists, or omit this line]\\n\\nNEXT STEP: [numbered list of what to do right now]"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `API error ${response.status}`, detail: errText })
      };
    }

    const data = await response.json();
    const raw = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const js = clean.indexOf('{');
    const je = clean.lastIndexOf('}');
    if (js === -1 || je === -1) {
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'No JSON in response', raw }) };
    }
    const result = JSON.parse(clean.substring(js, je + 1));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
