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

  const { userMsg, isNovice, isPublic, isComplex, isOngoing, selectedExp, goalSummary } = body;

  if (!userMsg) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing userMsg' }) };
  }

  const systemPrompt = `You are Fluent -- an AI prompt expert. Given a user's situation, generate the supporting setup sections for their AI playbook. Their goal: "${goalSummary || 'see user message'}".

COMPLEXITY: ${isComplex ? 'HIGH -- generate all applicable sections' : 'LOW -- generate usefulToKnow only. Leave all other fields as empty strings and set needsChaining/needsProject to false.'}
EXPERIENCE: ${selectedExp || 'unknown'}. ${isNovice ? 'Plain English only. No jargon. Simple analogies.' : 'Normal language.'}
PUBLIC BUILD: ${isPublic ? 'YES.' : 'No.'}
ONGOING: ${isOngoing ? 'YES -- generate projectInstructions.' : 'No -- leave projectInstructions empty.'}

CONVERSATION REALITY (include where relevant):
- AI conversations do not save history between sessions. Only memory entries and Project instructions persist.
- If a conversation gets very long, AI starts losing earlier details. Solution: copy key decisions, start fresh, paste summary.
- Memory entries mean the AI always knows your background -- but not what was said in previous conversations.

Return pure JSON only. No markdown. No text outside the JSON:
{
  "usefulToKnow": "${isNovice || selectedExp === 'Regularly but not getting the most out of it' ? '3-4 short plain-language tips specific to this user. Cover: why specific questions beat vague ones, what to do when AI gives a wrong answer, one tip for their goal type. No jargon.' : ''}",
  "setup": "${isComplex ? 'Setup guidance for this specific goal. General language -- not specific to any one AI tool.' : ''}",
  "needsChaining": ${isComplex},
  "chainingGuide": "${isComplex ? 'If goal has multiple phases: numbered sequence of 3-4 focused prompts. Label what each accomplishes. Ready to paste. Otherwise empty string.' : ''}",
  "needsProject": ${isOngoing},
  "projectInstructions": "${isOngoing ? 'Exact text to paste into a Project. Covers: who the user is, what the project is, what is already decided, how AI should behave.' : ''}",
  "behaviorInstaller": "${isComplex ? 'Memory entries to permanently upgrade AI behavior. Include: Fluent awareness, boldness, tool awareness, conversation monitoring, goal alignment. Written specifically for this person.' : ''}",
  "personalContext": "${isComplex ? 'Memory entries from what this person shared. Label PERSONAL CONTEXT. Cover background, constraints, goals, communication style, AI experience.' : ''}"
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
