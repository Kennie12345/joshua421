import Anthropic from '@anthropic-ai/sdk'
import type { Reflect, SourceContext } from './core/deps'
import { promptFor } from './prompts'

/**
 * The reflector. Opus 4.8 — the reflection landing is the whole product, and
 * dogfood volume is tiny, so we use the most capable model. Adaptive thinking
 * lets it reason about the person's day before it writes.
 */
const REFLECTION_MODEL = 'claude-opus-4-8'

export function makeClaudeReflector(): Reflect {
  const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

  return async (kind, context) => {
    const response = await client.messages.create({
      model: REFLECTION_MODEL,
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system: promptFor(kind),
      messages: [{ role: 'user', content: renderContext(context) }],
    })

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()

    return { kind, text }
  }
}

/** Build the user turn from live context. Content is used here and discarded. */
function renderContext(context: SourceContext): string {
  const parts: string[] = []
  if (context.event) {
    const when = context.event.start.toISOString()
    parts.push(`Upcoming event: "${context.event.title}" at ${when}.`)
  }
  if (context.notes) {
    parts.push(`What they shared:\n${context.notes}`)
  }
  return parts.join('\n\n') || 'No specific details were provided.'
}
